import { Command, Option } from "commander";
import type { CreateSourceBuildRequest, SignaloidClient } from "@signaloid/scce-sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { createSpinner, Spinner } from "../../utils/spinner";
import chalk from "chalk";
import { loadConfig } from "../../utils/config";
import { writeBinary } from "../../utils/fsx";
import { resolveDownloadFilename } from "../../utils/download-filename";
import { makeClient } from "../../utils/sdk";
import {
	addPaginationOptions,
	createCustomTable,
	displayResource,
	finishListingSpinner,
	fetchWithPagination,
	limitHelp,
	OutputFormat,
	printListing,
	printListingTable,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData } from "../../utils/verbosity";
import { parsePositiveInt } from "../../utils/validation";
import { usageError } from "../../utils/exit-codes";

const TERMINAL_BUILD_STATES = new Set(["completed", "cancelled", "stopped"]);
const WATCH_POLL_INTERVAL_MS = 3000;

/**
 * Waits until a build reaches a terminal state and returns that state.
 *
 * Uses the SDK's WebSocket wait. If that fails, polls the build status until the timeout,
 * because the SDK does not retry a WebSocket that drops before it connects.
 * Throws if the status cannot be fetched or the build is not finished in time.
 */
async function waitForBuildStatus(
	client: SignaloidClient,
	buildId: string,
	timeoutSec: number,
	spinner: Spinner,
): Promise<string> {
	const deadline = Date.now() + timeoutSec * 1000;
	try {
		return await client.builds.waitForBuild(buildId, { timeoutSec });
	} catch (e: any) {
		spinner.text = `Live updates failed (${e?.message || e}). Polling build ${buildId}...`;
	}
	let status: string | undefined;
	// Negated so that a NaN --timeout also stops.
	const timedOut = () => !(Date.now() < deadline);
	const timeoutError = () =>
		new Error(
			`Timed out after ${timeoutSec} s waiting for build ${buildId}${status ? ` (status: ${status})` : ""}`,
		);
	// A request still in flight at the deadline ends the wait with the timeout error.
	const beforeDeadline = <T>(request: Promise<T>) =>
		new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(timeoutError()), Math.max(0, deadline - Date.now()));
			request.then(resolve, reject).finally(() => clearTimeout(timer));
		});
	for (;;) {
		// Checked before and after each poll, so that a build only counts if it is seen finished in time.
		if (timedOut()) {
			throw timeoutError();
		}
		status = await beforeDeadline(client.builds.getStatus(buildId));
		if (timedOut()) {
			throw timeoutError();
		}
		if (TERMINAL_BUILD_STATES.has(String(status || "").toLowerCase())) {
			return status;
		}
		const sleepMs = Math.min(WATCH_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()));
		await new Promise((resolve) => setTimeout(resolve, sleepMs));
	}
}

/**
 * Registers the 'builds' command and subcommands for managing Signaloid builds.
 *
 * This command provides comprehensive build management functionality including
 * creating builds from source code or repositories, listing builds, checking
 * status, retrieving outputs, and canceling or deleting builds.
 *
 * Available subcommands:
 * - list: List all builds with optional filtering
 * - create:source: Create a build from a local source file
 * - create:repo: Create a build from a repository
 * - get: Get details of a specific build
 * - status: Get the current status of a build
 * - output: Download and display build output
 * - output-urls: Get URLs to build outputs
 * - watch: Wait for build completion and print outputs
 * - cancel: Cancel a running build
 * - delete: Delete a build
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli builds list --status Completed
 * signaloid-cli builds create:source --file main.c --lang C --core core-123
 * signaloid-cli builds watch --build-id build-456
 * signaloid-cli builds output --build-id build-456 --out ./output.txt
 * ```
 */
export default function builds(program: Command) {
	const cmd = program.command("builds").description("Create and manage source code builds");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	// signaloid-cli builds list --status "Completed" --from 2025-09-01T00:00:00Z --to 2025-10-01T00:00:00Z --cursor <cursor> --count 20
	addPaginationOptions(cmd.command("list"), {
		limitHelp: "Builds per request, at most 25 (500 with --summary)",
		filtersAfterLimit: true,
	})
		.description("List builds")
		.option("--from <iso>", "Filter: ISO start time")
		.option("--to <iso>", "Filter: ISO end time")
		.option(
			"--status <status>",
			'Filter by status (Accepted|Initialising|"In Progress"|Completed|Cancelled|Stopped|Rescheduled)',
		)
		.option(
			"--summary",
			"Return lightweight build summaries ({BuildID, Owner, CreatedAt}) instead of full details. Allows a much larger page size.",
		)
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("builds");
				return;
			}

			const spinner = createSpinner("Fetching builds...");
			try {
				const client = makeClient(await loadConfig());
				const summary = opts.summary === true;

				const result = await fetchWithPagination(
					(query) => {
						const listOptions = { ...query, from: opts.from, to: opts.to, status: opts.status };
						return summary ? client.builds.listSummary(listOptions) : client.builds.list(listOptions);
					},
					"Builds",
					// --status is applied after limit, so each request asks for a full page.
					{ ...opts, filtersAfterLimit: Boolean(opts.status) },
				);

				finishListingSpinner(spinner, result);

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printListing("Builds", result);
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printListingTable("builds", result, selectedColumns);
				}
			} catch (e: any) {
				spinner.fail("Failed to list builds");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds create:source --file main.c --lang C --core core-123 --args "--fast"
	cmd.command("create:source")
		.description("Create a build from a local source file")
		.requiredOption("--file <path>", "Source file path")
		.requiredOption("--lang <C|C++|Fortran>", "Source language")
		.option("--args <args>", "Default runtime arguments")
		.option("--core-id <coreId>", "Core ID")
		.option(
			"--trace-variables <json>",
			'JSON array of TraceVariableRequest objects (not on r7i cores), e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"data","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.option("--public", "Mark the build as publicly accessible")
		.option("--discover-variables", "Request the build to discover traceable variables (not on r7i cores)")
		.option("--config-mk <path>", "Path to a config.mk file")
		.action(async (opts) => {
			const spinner = createSpinner("Creating build (source code)...");
			try {
				const client = makeClient(await loadConfig());
				const abs = path.resolve(String(opts.file));
				const code = await fs.readFile(abs, "utf-8");

				const payload: CreateSourceBuildRequest = {
					Code: code,
					Language: opts.lang,
				};
				if (opts.coreId) payload.CoreID = opts.coreId;
				if (typeof opts.args === "string") payload.Arguments = opts.args;
				if (typeof opts.traceVariables === "string") {
					try {
						payload.TraceVariables = JSON.parse(opts.traceVariables);
					} catch (parseErr) {
						spinner.fail("Invalid --trace-variables JSON");
						throw parseErr;
					}
				}
				if (typeof opts.dataSources === "string") {
					try {
						payload.DataSources = JSON.parse(opts.dataSources);
					} catch (parseErr) {
						spinner.fail("Invalid --data-sources JSON");
						throw parseErr;
					}
				}
				if (opts.public === true) payload.IsPublic = true;
				if (typeof opts.configMk === "string") {
					const configMkAbs = path.resolve(String(opts.configMk));
					payload.ConfigMk = await fs.readFile(configMkAbs, "utf-8");
				}

				const discoverVars = opts.discoverVariables === true ? true : undefined;

				const res = await client.builds.createFromSourceCode(payload, discoverVars);
				spinner.succeed("Build created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Build creation failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds status --build-id <buildId>
	cmd.command("status")
		.description("Get build status")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching status...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOne(buildId);
				spinner.succeed();
				printData(
					JSON.stringify(
						{
							BuildID: res.BuildID,
							Status: res.Status,
							UpdatedAt: res.UpdatedAt,
							CreatedAt: res.CreatedAt,
						},
						null,
						2,
					),
				);
			} catch (e: any) {
				spinner.fail("Failed to get status");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds output-urls --build-id <buildId>
	cmd.command("output-urls")
		.description("Print URLs to build outputs")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching output URLs...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOutputs(String(opts.buildId));
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get output URLs");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds output --build-id <buildId>
	cmd.command("output")
		.description("Print build output")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--out <file path>", "Path to save file")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build output...");
			try {
				const client = makeClient(await loadConfig());

				const [build, res] = await Promise.all([
					client.builds.getOne(buildId),
					client.builds.getOutputs(buildId),
				]);

				const status = String(build.Status || "").toLowerCase();
				if (!TERMINAL_BUILD_STATES.has(status)) {
					spinner.warn(
						`Build is not complete (status: ${build.Status}). Output may be empty. Use 'builds watch --build-id ${buildId}' to wait for completion.`,
					);
				}

				const outputRes = await fetch(res.Build, { method: "GET" });
				const text = await outputRes.text();
				const outOpt = opts.out;
				if (outOpt) {
					const fullPath = path.resolve(outOpt);
					const outDir = path.dirname(fullPath);
					const fileName = path.basename(fullPath);
					await writeBinary(outDir, fileName, Buffer.from(text, "utf-8"));
					spinner.succeed(`Saved: ${fullPath}`);
				} else if (!text.trim()) {
					spinner.warn(`Build output is empty (status: ${build.Status})`);
				} else {
					spinner.succeed("Build output:");
					printData(text);
				}
			} catch (e: any) {
				spinner.fail("Failed to get output for the build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds watch --build-id <buildId>
	cmd.command("watch")
		.description("Wait for completion and print outputs")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--timeout <sec>", "Timeout in seconds (default 60)", parsePositiveInt)
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner(`Waiting for build ${buildId}...`);
			try {
				const client = makeClient(await loadConfig());
				const status = await waitForBuildStatus(client, buildId, opts.timeout ?? 60, spinner);
				const final = String(status || "").toLowerCase();
				spinner.succeed(`Build finished: ${status}`);
				process.exit(TERMINAL_BUILD_STATES.has(final) && final === "completed" ? 0 : 1);
			} catch (e: any) {
				spinner.fail("Failed while waiting for build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds get --build-id <buildId>
	cmd.command("get")
		.description("Get a single build")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOne(buildId);
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Build: ${buildId}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds create:repo --repo-id r_123 --core-id core-123 --args "--foo" --discover-vars [--trace-variables <json>] [--data-sources <json>] [--public|--private]
	cmd.command("create:repo")
		.description("Create a build from a repository")
		.requiredOption("--repo-id <id>", "Repository ID")
		.option("--args <args>", "Default runtime arguments")
		.option("--core-id <coreId>", "Core ID")
		.option("--discover-variables", "Request the build to discover traceable variables (not on r7i cores)", false)
		.addOption(new Option("--discover-vars", "Alias for --discover-variables").hideHelp())
		.option(
			"--trace-variables <json>",
			'JSON array of TraceVariable objects (not on r7i cores), e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"data","Object":"DataSource","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.addOption(new Option("--public", "Mark the resulting build as public").conflicts("private"))
		.addOption(new Option("--private", "Mark the resulting build as private (default)").conflicts("public"))
		.action(async (opts) => {
			const spinner = createSpinner("Creating repository build...");
			try {
				const client = makeClient(await loadConfig());

				const payload: {
					CoreID?: string;
					Arguments?: string;
					TraceVariables?: any[];
					DataSources?: any[];
					IsPublic?: boolean;
				} = {};
				if (opts.coreId) payload.CoreID = opts.coreId;
				if (typeof opts.args === "string") payload.Arguments = opts.args;
				if (typeof opts.traceVariables === "string") {
					try {
						payload.TraceVariables = JSON.parse(opts.traceVariables);
					} catch (parseErr) {
						spinner.fail("Invalid --trace-variables JSON");
						throw parseErr;
					}
				}
				if (typeof opts.dataSources === "string") {
					try {
						payload.DataSources = JSON.parse(opts.dataSources);
					} catch (parseErr) {
						spinner.fail("Invalid --data-sources JSON");
						throw parseErr;
					}
				}
				if (opts.public) payload.IsPublic = true;
				else if (opts.private) payload.IsPublic = false;

				const res = await client.builds.createFromRepository(
					String(opts.repoId),
					Object.keys(payload).length ? payload : undefined,
					!!(opts.discoverVariables || opts.discoverVars),
				);

				spinner.succeed("Build created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Repo build failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds update --build-id <buildId> [--visibility <public|private> | --public | --private]
	cmd.command("update")
		.description("Update build properties")
		.requiredOption("--build-id <id>", "Build ID")
		.addOption(new Option("--visibility <value>", "Set build visibility").choices(["public", "private"]))
		.addOption(new Option("--public", "Make the build public").conflicts(["private", "visibility"]))
		.addOption(new Option("--private", "Make the build private").conflicts(["public", "visibility"]))
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			let isPublic: boolean;
			if (opts.visibility === "public") isPublic = true;
			else if (opts.visibility === "private") isPublic = false;
			else if (opts.public) isPublic = true;
			else if (opts.private) isPublic = false;
			else return usageError("Provide --visibility <public|private>, --public, or --private.");
			const spinner = createSpinner("Updating build...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.updateOne(buildId, { IsPublic: isPublic });
				spinner.succeed("Build updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds variables --build-id <buildId> [--count <n>] [--limit <n>] [--cursor <cursor>]
	addPaginationOptions(cmd.command("variables"), { limitHelp: limitHelp(100) })
		.description("List variables for a build")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build variables...");
			try {
				const client = makeClient(await loadConfig());
				const result = await fetchWithPagination(
					(query) => client.builds.getVariables(buildId, query),
					"Variables",
					opts,
				);
				finishListingSpinner(spinner, result);
				printListing("Variables", result, { BuildID: buildId });
			} catch (e: any) {
				spinner.fail("Failed to get build variables");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds tasks --build-id <buildId> [--count <n>] [--limit <n>] [--cursor <cursor>] [--from <iso>] [--to <iso>]
	addPaginationOptions(cmd.command("tasks"))
		.description("List tasks for a build")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--from <iso>", "Filter: ISO start time")
		.option("--to <iso>", "Filter: ISO end time")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build tasks...");
			try {
				const client = makeClient(await loadConfig());
				const result = await fetchWithPagination(
					(query) => client.builds.listTasks(buildId, { ...query, from: opts.from, to: opts.to }),
					"Tasks",
					opts,
				);
				finishListingSpinner(spinner, result);
				printListing("Tasks", result, { BuildID: buildId });
			} catch (e: any) {
				spinner.fail("Failed to list build tasks");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds binary --build-id <buildId> [--out <dir>] [--filename <name>] [--url-only]
	cmd.command("binary")
		.description("Get download URL for the build binary, or download it with --out")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--out <dir>", "Directory to download the binary to")
		.option(
			"--filename <name>",
			"Override the saved filename (default: the name the Signaloid Cloud Compute Engine provides)",
		)
		.option("--url-only", "Print only the presigned URL even when --out is set", false)
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build binary URL...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getBinary(buildId);

				if (opts.urlOnly) {
					spinner.succeed();
					printData(res.url ? res.url : "");
					return;
				}
				if (!opts.out) {
					spinner.succeed();
					printData(JSON.stringify(res, null, 2));
					return;
				}

				const { url } = res;
				if (!url) {
					spinner.fail("No binary URL returned by server");
					return;
				}

				spinner.start("Downloading build binary...");
				const binaryRes = await fetch(url, { method: "GET" });
				if (!binaryRes.ok) {
					spinner.fail(`Failed to download binary: HTTP ${binaryRes.status}`);
					return;
				}
				const buf = Buffer.from(await binaryRes.arrayBuffer());
				const outDir = path.resolve(String(opts.out));
				const fileName = opts.filename
					? String(opts.filename)
					: resolveDownloadFilename(binaryRes.headers, url, `${buildId}.bin`);
				await writeBinary(outDir, fileName, buf);
				const fullPath = path.join(outDir, fileName);
				spinner.succeed(`Saved: ${fullPath}`);
			} catch (e: any) {
				spinner.fail("Failed to get build binary");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds cancel --build-id <buildId>
	cmd.command("cancel")
		.description("Cancel a running build")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner(`Cancelling build ${buildId}...`);
			try {
				const client = makeClient(await loadConfig());
				await client.builds.cancel(buildId);
				spinner.succeed("Build cancelled");
				printData(JSON.stringify({ BuildID: buildId, cancelled: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to cancel build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds delete --build-id <buildId>
	cmd.command("delete")
		.description("Delete a build")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner(`Deleting build ${buildId}...`);
			try {
				const client = makeClient(await loadConfig());
				await client.builds.deleteOne(buildId);
				spinner.succeed("Build deleted");
				printData(JSON.stringify({ BuildID: buildId, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete build");
				await handleCliError(e);
			}
		});
}
