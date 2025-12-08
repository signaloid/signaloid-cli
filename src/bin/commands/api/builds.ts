import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import ora from "ora";
import chalk from "chalk";
import { loadConfig } from "../../utils/config";
import { writeBinary } from "../../utils/fsx";
import { makeClient } from "../../utils/sdk";
import {
	formatBuildsTable,
	displayResource,
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";

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
	const cmd = program.command("builds").description("Work with builds");

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
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("builds");
				return;
			}

			const spinner = ora("Fetching builds...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination(
					(startKey) =>
						client.builds.list({
							startKey: startKey || opts.startKey,
							from: opts.from,
							to: opts.to,
							status: opts.status,
						}),
					"Builds",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Builds: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("builds", result.items, selectedColumns));
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
		.action(async (opts) => {
			const spinner = ora("Creating build (source code)...").start();
			try {
				const client = makeClient(await loadConfig());
				const abs = path.resolve(String(opts.file));
				const code = await fs.readFile(abs, "utf-8");

				const payload: {
					Code: string;
					Language: "C" | "C++" | "Fortran";
					CoreID?: string;
					Arguments?: string;
				} = {
					Code: code,
					Language: opts.lang,
				};
				if (opts.coreId) payload.CoreID = opts.coreId;
				if (typeof opts.args === "string") payload.Arguments = opts.args;

				const res = await client.builds.createFromSourceCode(payload);
				spinner.succeed("Build created");
				console.log(JSON.stringify(res, null, 2));
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
			const spinner = ora("Fetching status...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOne(buildId);
				spinner.succeed();
				console.log(
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
			const spinner = ora("Fetching output URLs...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOutputs(String(opts.buildId));
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
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
			const spinner = ora("Fetching output URLs...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOutputs(buildId);
				const outputRes = await fetch(res.Build, { method: "GET" });
				const text = await outputRes.text();
				const outOpt = opts.out;
				if (outOpt) {
					// Use Node.js path utilities for proper path handling
					const fullPath = path.resolve(outOpt);
					const outDir = path.dirname(fullPath);
					const fileName = path.basename(fullPath);

					// writeBinary(dir, filename, buf)
					await writeBinary(outDir, fileName, Buffer.from(text, "utf-8"));
					spinner.succeed(`Saved: ${fullPath}`);
				} else {
					spinner.succeed(text);
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
		.option("--timeout <ms>", "Timeout in ms (default 60000)", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = ora(`Waiting for build ${buildId}...`).start();
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
		.option("--format <type>", "Output format: json|table", "table")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = ora("Fetching build...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.builds.getOne(buildId);
				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					console.log(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Build: ${buildId}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get build");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds create:repo --repo-id r_123 --core core-123 --args "--foo" --discover-vars
	cmd.command("create:repo")
		.description("Create a build from a repository")
		.requiredOption("--repo-id <id>", "Repository ID")
		.option("--args <args>", "Default runtime arguments")
		.option("--core-id <coreId>", "Core ID")
		.option("--discover-vars", "Ask server to discover variables", false)
		.action(async (opts) => {
			const spinner = ora("Creating repository build...").start();
			try {
				const client = makeClient(await loadConfig());

				const payload: {
					CoreID?: string;
					Arguments?: string;
				} = {};
				if (opts.coreId) payload.CoreID = opts.coreId;
				if (typeof opts.args === "string") payload.Arguments = opts.args;

				const res = await client.builds.createFromRepository(
					String(opts.repoId),
					Object.keys(payload).length ? payload : undefined,
					!!opts.discoverVars,
				);

				spinner.succeed("Build created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Repo build failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli builds cancel --build-id <buildId>
	cmd.command("cancel")
		.description("Cancel a running build")
		.requiredOption("--build-id <id>", "Build ID")
		.action(async (opts) => {
			const buildId = String(opts.buildId);
			const spinner = ora(`Cancelling build ${buildId}...`).start();
			try {
				const client = makeClient(await loadConfig());
				await client.builds.cancel(buildId);
				spinner.succeed("Build cancelled");
				console.log(JSON.stringify({ BuildID: buildId, cancelled: true }, null, 2));
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
			const spinner = ora(`Deleting build ${buildId}...`).start();
			try {
				const client = makeClient(await loadConfig());
				await client.builds.deleteOne(buildId);
				spinner.succeed("Build deleted");
				console.log(JSON.stringify({ BuildID: buildId, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete build");
				await handleCliError(e);
			}
		});
}
