import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import {
	OutputFormat,
	displayResource,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData } from "../../utils/verbosity";

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
	const cmd = program.command("buckets").description("Manage cloud storage buckets");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("list")
		.description("List buckets")
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("buckets");
				return;
			}

			const spinner = createSpinner("Fetching buckets...");
			try {
				const client = makeClient(await loadConfig());

				const listRes = await client.buckets.list();
				const bucketIds: string[] = listRes.bucket_ids || [];

				const buckets = await Promise.all(
					bucketIds.map((id) => client.buckets.getOne(id)),
				);

				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify({ Buckets: buckets }, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printData(createCustomTable("buckets", buckets, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch buckets");
				await handleCliError(e);
			}
		});

	cmd.command("get")
		.description("Get a bucket by ID")
		.requiredOption("--bucket-id <id>", "Bucket ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.bucketId);
			const spinner = createSpinner("Fetching bucket...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.buckets.getOne(id);
				spinner.succeed();
				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Bucket: ${id}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get bucket");
				await handleCliError(e);
			}
		});

	cmd.command("create")
		.description("Create a bucket")
		.requiredOption("--name <name>", "Bucket name (Name)")
		.requiredOption("--account <account>", "Account identifier (Account)")
		.option("--mount-path <path>", "Mount path (MountPath)")
		.option("--read", "Enable read access (Read)")
		.option("--write", "Enable write access (Write)")
		.action(async (opts) => {
			const spinner = createSpinner("Creating bucket...");
			try {
				const client = makeClient(await loadConfig());

				const payload: {
					Name: string;
					Account: string;
					MountPath?: string;
					Read?: boolean;
					Write?: boolean;
				} = {
					Name: opts.name,
					Account: opts.account,
				};

				if (typeof opts.mountPath === "string") payload.MountPath = opts.mountPath;
				if (typeof opts.read !== "undefined") payload.Read = !!opts.read;
				if (typeof opts.write !== "undefined") payload.Write = !!opts.write;

				const res = await client.buckets.create(payload as any);
				spinner.succeed("Bucket created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create bucket");
				await handleCliError(e);
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
		.action(async (opts) => {
			const bucketId = String(opts.bucketId);
			const spinner = createSpinner("Updating bucket...");
			try {
				const client = makeClient(await loadConfig());

				const patch: Record<string, unknown> = {};
				if (typeof opts.name === "string") patch.Name = opts.name;
				if (typeof opts.account === "string") patch.Account = opts.account;
				if (typeof opts.mountPath === "string") patch.MountPath = opts.mountPath;
				if (typeof opts.read !== "undefined") patch.Read = !!opts.read;
				if (typeof opts.write !== "undefined") patch.Write = !!opts.write;

				const res = await client.buckets.update(bucketId, patch as any);
				spinner.succeed("Bucket updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update bucket");
				await handleCliError(e);
			}
		});

	cmd.command("delete")
		.description("Delete a bucket")
		.requiredOption("--bucket-id <id>", "Bucket ID")
		.action(async (opts) => {
			const bucketId = String(opts.bucketId);
			const spinner = createSpinner("Deleting bucket...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.buckets.delete(bucketId);
				spinner.succeed("Bucket deleted");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete bucket");
				await handleCliError(e);
			}
		});
}
