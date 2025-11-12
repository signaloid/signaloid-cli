import { OutputStream } from "@signaloid/scce-sdk";
import { Command } from "commander";
import path from "node:path";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { writeBinary } from "../../utils/fsx";
import {
	createCustomTable,
	displayResource,
	fetchWithPagination,
	OutputFormat,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { loadJsonIfPath, parseKeyVals } from "../../utils/params";
import { makeClient } from "../../utils/sdk";

const TERMINAL_TASK_STATES = new Set(["completed", "cancelled", "stopped"]);

type CreateTaskRequest = {
	Arguments?: string;
	DataSources?: Array<{
		Location?: string;
		ResourceID: string;
		ResourceType: string;
	}>;
};

/**
 * Registers the 'tasks' command and subcommands for managing execution tasks.
 *
 * This command provides comprehensive task management functionality including
 * creating tasks from builds, listing tasks, checking status, retrieving outputs,
 * and canceling or deleting tasks. Tasks represent individual executions of
 * compiled builds with specific input parameters.
 *
 * Available subcommands:
 * - create: Create a new task from a build
 * - list: List all tasks with optional filtering
 * - get: Get details of a specific task
 * - status: Get the current status of a task
 * - output: Download task output (stdout/stderr)
 * - output-urls: Get URLs to task outputs
 * - watch: Wait for task completion
 * - cancel: Cancel a running task
 * - delete: Delete a task
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli tasks create --build-id build-123 --args "arg1 arg2"
 * signaloid-cli tasks list --status completed
 * signaloid-cli tasks watch --task-id task-456
 * signaloid-cli tasks output --task-id task-456 --stream stdout --out ./output.txt
 * ```
 */
export default function tasks(program: Command) {
	const cmd = program.command("tasks").description("Work with tasks");

	// signaloid-cli tasks create --build-id <id> [--args "..."] [--params-file file.json] [--param Arguments="..."]
	cmd.command("create")
		.description("Create a task from a build")
		.requiredOption("--build-id <id>", "Build ID")
		.option("--args <str>", "Default input arguments for the task")
		.option("--params-file <file>", "JSON file with CreateTaskRequest")
		.option("--param <k=v...>", "Inline param (repeatable)", (v, prev: string[]) => (prev ? [...prev, v] : [v]), [])
		.action(async (opts) => {
			const spinner = ora("Creating task...").start();
			try {
				const client = makeClient(await loadConfig());

				// Load params from JSON if provided
				const fromFile = (await loadJsonIfPath(opts.paramsFile)) as CreateTaskRequest | undefined;

				// Inline k=v → currently only merge Arguments, rest should go via --params-file
				const inline = parseKeyVals(opts.param as string[]);
				const payload: CreateTaskRequest = {
					...(fromFile || {}),
				};

				// Direct flags take precedence
				if (typeof opts.args === "string") {
					payload.Arguments = opts.args;
				} else if (inline.Arguments) {
					payload.Arguments = String(inline.Arguments);
				}

				// SDK here expects 2 args: (buildID, payload)
				const res = await client.tasks.createTask(String(opts.buildId), payload);

				spinner.succeed("Task created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Task creation failed");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks list [--status ...] [--from iso] [--to iso] [--start-key key] [--count n]
	cmd.command("list")
		.description("List tasks")
		.option("--status <s>", "Filter by status (Accepted|Initialising|In Progress|Completed|Cancelled|Stopped)")
		.option("--from <iso>", "From timestamp (ISO)")
		.option("--to <iso>", "To timestamp (ISO)")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("tasks");
				return;
			}

			const spinner = ora("Fetching tasks...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination(
					(startKey) =>
						client.tasks.list({
							status: opts.status,
							from: opts.from,
							to: opts.to,
							startKey: startKey || opts.startKey,
						}),
					"Tasks",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Tasks: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("tasks", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list tasks");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks get --task-id <taskId>
	cmd.command("get")
		.description("Get one task")
		.requiredOption("--task-id <id>", "Task ID")
		.option("--format <type>", "Output format: json|table", "table")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Fetching task...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.tasks.getOne(taskId);
				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					console.log(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Task: ${taskId}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get task");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks status --task-id <taskId>
	cmd.command("status")
		.description("Get task status")
		.requiredOption("--task-id <id>", "Task ID")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Fetching status...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.tasks.getStatus(taskId);
				spinner.succeed();
				console.log(JSON.stringify({ TaskID: taskId, Status: res }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get status");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks output-urls --task-id <taskId>
	cmd.command("output-urls")
		.description("Print URLs to task outputs")
		.requiredOption("--task-id <id>", "Task ID")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Fetching output URLs...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.tasks.getOutputURLs(taskId);
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get output URLs");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks output --task-id <taskId> [--stream stdout|stderr] [--out ./outputs]
	cmd.command("output")
		.description("Download task output as text")
		.requiredOption("--task-id <id>", "Task ID")
		.option("--stream <stdout|stderr>", "Which stream to fetch", "stdout")
		.option("--out <dir>", "Path to save file")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Downloading output...").start();
			try {
				const client = makeClient(await loadConfig());

				const streamOpt = String(opts.stream || "stdout").toLowerCase();
				const outStream = streamOpt === "stderr" ? "Stderr" : "Stdout";

				// SDK: getOutput(taskID, outStream) -> string
				const outputRes: string = await client.tasks.getOutput(taskId, outStream as OutputStream);
				const outOpt = opts.out;
				if (outOpt) {
					// Use Node.js path utilities for proper path handling
					const fullPath = path.resolve(outOpt);
					const outDir = path.dirname(fullPath);
					const fileName = path.basename(fullPath);

					// writeBinary(dir, filename, buf)
					await writeBinary(outDir, fileName, Buffer.from(JSON.stringify(outputRes, null, 2), "utf-8"));
					spinner.succeed(`Saved: ${fullPath}`);
				} else {
					spinner.succeed(JSON.stringify(outputRes, null, 2));
				}
			} catch (e: any) {
				spinner.fail("Failed to download output");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks cancel --task-id <taskId>
	cmd.command("cancel")
		.description("Cancel a running task")
		.requiredOption("--task-id <id>", "Task ID")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Canceling task...").start();
			try {
				const client = makeClient(await loadConfig());
				await client.tasks.cancel(taskId);
				spinner.succeed("Cancel requested");
				console.log(JSON.stringify({ TaskID: taskId, cancelled: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to cancel task");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks delete --task-id <taskId>
	cmd.command("delete")
		.description("Delete a task")
		.requiredOption("--task-id <id>", "Task ID")
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora("Deleting task...").start();
			try {
				const client = makeClient(await loadConfig());
				await client.tasks.deleteOne(taskId);
				spinner.succeed("Task deleted");
				console.log(JSON.stringify({ TaskID: taskId, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete task");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli tasks watch --task-id <taskId> [--timeout 60]
	cmd.command("watch")
		.description("Wait for task to reach a terminal state")
		.requiredOption("--task-id <id>", "Task ID")
		.option("--timeout <sec>", "Timeout in seconds (default 60)", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const taskId = String(opts.taskId);
			const spinner = ora(`Waiting for task ${taskId}...`).start();
			try {
				const client = makeClient(await loadConfig());
				const status = await client.tasks.waitForTask(taskId, {
					timeoutSec: opts.timeout,
				});
				const final = String(status || "").toLowerCase();
				spinner.succeed(`Task finished: ${status}`);
				process.exit(TERMINAL_TASK_STATES.has(final) && final === "completed" ? 0 : 1);
			} catch (e: any) {
				spinner.fail("Failed to watch task");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
