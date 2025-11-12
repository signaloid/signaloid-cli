import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import {
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";

/**
 * Registers the 'buckets' command and subcommands for managing cloud storage buckets.
 *
 * This command provides functionality for managing S3-compatible cloud storage buckets
 * used by Signaloid applications, including listing, creating, updating, and deleting buckets.
 *
 * Available subcommands:
 * - list: List all buckets with optional pagination
 * - create: Create a new bucket with specified configuration
 * - update: Update an existing bucket's configuration
 * - delete: Delete a bucket
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli buckets list
 * signaloid-cli buckets create --name my-bucket --account acc-123 --region us-east-1
 * signaloid-cli buckets update --bucket-id bucket-456 --read --write
 * ```
 */
export default function buckets(program: Command) {
	const cmd = program.command("buckets").description("Manage buckets");

	cmd.command("list")
		.description("List buckets")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("buckets");
				return;
			}

			const spinner = ora("Fetching buckets...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination(
					(startKey) => client.buckets.list(startKey ? { startKey: startKey } : undefined),
					"Buckets",
					targetCount,
					spinner,
					opts.startKey,
				);

				spinner.succeed("Buckets fetched");

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Buckets: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("buckets", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch buckets");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("create")
		.description("Create a bucket")
		.requiredOption("--name <name>", "Bucket name (Name)")
		.requiredOption("--account <account>", "Account identifier (Account)")
		.option("--mount-path <path>", "Mount path (MountPath)")
		.option("--read", "Enable read access (Read)")
		.option("--write", "Enable write access (Write)")
		.option("--region <region>", "Cloud region (Region)")
		.action(async (opts) => {
			const spinner = ora("Creating bucket...").start();
			try {
				const client = makeClient(await loadConfig());

				const payload: {
					Name: string;
					Account: string;
					MountPath?: string;
					Read?: boolean;
					Write?: boolean;
					Region?: string;
				} = {
					Name: opts.name,
					Account: opts.account,
				};

				if (typeof opts.mountPath === "string") payload.MountPath = opts.mountPath;
				if (typeof opts.read !== "undefined") payload.Read = !!opts.read;
				if (typeof opts.write !== "undefined") payload.Write = !!opts.write;
				if (typeof opts.region === "string") payload.Region = opts.region;

				const res = await client.buckets.create(payload as any);
				spinner.succeed("Bucket created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create bucket");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("update")
		.description("Update a bucket")
		.requiredOption("--bucket-id <id>", "Bucket ID")
		.option("--name <name>", "Bucket name (Name)")
		.option("--account <account>", "Account identifier (Account)")
		.option("--mount-path <path>", "Mount path (MountPath)")
		.option("--read", "Enable read access (Read)")
		.option("--write", "Enable write access (Write)")
		.option("--region <region>", "Cloud region (Region)")
		.action(async (opts) => {
			const bucketId = String(opts.bucketId);
			const spinner = ora("Updating bucket...").start();
			try {
				const client = makeClient(await loadConfig());

				const patch: Record<string, unknown> = {};
				if (typeof opts.name === "string") patch.Name = opts.name;
				if (typeof opts.account === "string") patch.Account = opts.account;
				if (typeof opts.mountPath === "string") patch.MountPath = opts.mountPath;
				if (typeof opts.read !== "undefined") patch.Read = !!opts.read;
				if (typeof opts.write !== "undefined") patch.Write = !!opts.write;
				if (typeof opts.region === "string") patch.Region = opts.region;

				const res = await client.buckets.update(bucketId, patch as any);
				spinner.succeed("Bucket updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update bucket");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("delete")
		.description("Delete a bucket")
		.requiredOption("--bucket-id <id>", "Bucket ID")
		.action(async (opts) => {
			const bucketId = String(opts.bucketId);
			const spinner = ora("Deleting bucket...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.buckets.delete(bucketId);
				spinner.succeed("Bucket deleted");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete bucket");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
