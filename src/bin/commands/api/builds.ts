import { Command } from "commander";
import type { CreateSourceBuildRequest } from "@signaloid/scce-sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { createSpinner } from "../../utils/spinner";
import chalk from "chalk";
import { loadConfig } from "../../utils/config";
import { writeBinary } from "../../utils/fsx";
import { makeClient } from "../../utils/sdk";
import {
	displayResource,
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData } from "../../utils/verbosity";

const TERMINAL_BUILD_STATES = new Set(["completed", "cancelled", "stopped"]);

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

	// signaloid-cli builds list --status "Completed" --from 2025-09-01T00:00:00Z --to 2025-10-01T00:00:00Z --start-key sk_123 --count 20
	cmd.command("list")
		.description("List builds")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--from <iso>", "Filter: ISO start time")
		.option("--to <iso>", "Filter: ISO end time")
		.option(
			"--status <status>",
			'Filter by status (Accepted|Initialising|"In Progress"|Completed|Cancelled|Stopped|Rescheduled)',
		)
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option(
			"--limit <n>",
			"Server-side page size limit (max 25 in expanded mode, 500 with --summary)",
			(v) => parseInt(v, 10),
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
				const targetCount = opts.count;
				const summary = opts.summary === true;

				const result = await fetchWithPagination(
					(startKey) => {
						const listOptions = {
							startKey: startKey || opts.startKey,
							from: opts.from,
							to: opts.to,
							status: opts.status,
							...(opts.limit !== undefined ? { limit: opts.limit } : {}),
						};
						return summary
							? client.builds.listSummary(listOptions)
							: client.builds.list(listOptions);
					},
					"Builds",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					const output: any = { Builds: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					printData(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printData(createCustomTable("builds", result.items, selectedColumns));
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
			'JSON array of TraceVariableRequest objects, e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"/data","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.option("--public", "Mark the build as publicly accessible (sets IsPublic=true)")
		.option("--discover-variables", "Request the build to discover traceable variables (sets DiscoverVariables=true query param)")
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
		.option("--timeout <sec>", "Timeout in seconds (default 60)", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner(`Waiting for build ${buildId}...`);
			try {
				const client = makeClient(await loadConfig());
				const status = await client.builds.waitForBuild(buildId, {
					timeoutSec: opts.timeout,
				});
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
		.option("--discover-vars", "Ask server to discover variables", false)
		.option(
			"--trace-variables <json>",
			'JSON array of TraceVariable objects, e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"/data","Object":"DataSource","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.addOption(new (require("commander").Option)("--public", "Mark the resulting build as public").conflicts("private"))
		.addOption(
			new (require("commander").Option)("--private", "Mark the resulting build as private (default)").conflicts("public"),
		)
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
					!!opts.discoverVars,
				);

				spinner.succeed("Build created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Repo build failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds update --build-id <buildId> [--public | --private]
	cmd.command("update")
		.description("Update build properties")
		.requiredOption("--build-id <id>", "Build ID")
		.addOption(
			new (require("commander").Option)("--public", "Make the build public").conflicts("private"),
		)
		.addOption(
			new (require("commander").Option)("--private", "Make the build private (default)").conflicts("public"),
		)
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Updating build...");
			try {
				const client = makeClient(await loadConfig());
				const payload: { IsPublic?: boolean } = {};
				if (opts.public) payload.IsPublic = true;
				else if (opts.private) payload.IsPublic = false;
				const res = await client.builds.updateOne(buildId, payload);
				spinner.succeed("Build updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds variables --build-id <buildId> [--start-key sk_123]
	cmd.command("variables")
		.description("List variables for a build")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--start-key <key>", "Pagination cursor token")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build variables...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getVariables(buildId, opts.startKey);
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get build variables");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds tasks --build-id <buildId> [--start-key sk_123] [--from iso] [--to iso]
	cmd.command("tasks")
		.description("List tasks for a build")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--from <iso>", "Filter: ISO start time")
		.option("--to <iso>", "Filter: ISO end time")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build tasks...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.listTasks(buildId, {
					startKey: opts.startKey,
					from: opts.from,
					to: opts.to,
				});
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
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
		.option("--filename <name>", "Override the saved filename (default: build-<id>.bin)")
		.option("--url-only", "Print only the presigned URL even when --out is set", false)
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = createSpinner("Fetching build binary URL...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getBinary(buildId);

				if (opts.urlOnly || !opts.out) {
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
				const fileName = opts.filename ? String(opts.filename) : `build-${buildId}.bin`;
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
