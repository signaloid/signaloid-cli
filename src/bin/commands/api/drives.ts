import { Command } from "commander";
import ora from "ora";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import {
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";

type DataSource = {
	Object?: "DataSource";
	ResourceID: string;
	ResourceType: "Gateway" | "Bucket" | "SignaloidCloudStorage";
	Location: string;
};

function normalizeDataSource(input: any): DataSource {
	if (!input || typeof input !== "object") {
		throw new Error("Invalid DataSource: must be a JSON object");
	}
	const ds: DataSource = {
		ResourceID: String(input.ResourceID),
		ResourceType: input.ResourceType as DataSource["ResourceType"],
		Location: String(input.Location),
	};
	(ds as any).Object = "DataSource";

	const validTypes = new Set<DataSource["ResourceType"]>(["Gateway", "Bucket", "SignaloidCloudStorage"]);
	if (!validTypes.has(ds.ResourceType)) {
		throw new Error(
			`Invalid ResourceType '${input.ResourceType}'. Expected one of Gateway|Bucket|SignaloidCloudStorage.`,
		);
	}
	if (!ds.ResourceID) throw new Error("DataSource.ResourceID is required");
	if (!ds.Location) throw new Error("DataSource.Location is required");
	return ds;
}

async function collectDataSources(opts: {
	ds?: string[]; // collected by Commander as string[]
	dsFile?: string;
}): Promise<DataSource[] | undefined> {
	const out: DataSource[] = [];

	const dsFlags: string[] = Array.isArray(opts.ds) ? opts.ds : [];
	for (const raw of dsFlags) {
		try {
			const parsed = JSON.parse(String(raw));
			out.push(normalizeDataSource(parsed));
		} catch (e: any) {
			throw new Error(`Failed to parse --ds JSON: ${e?.message || String(e)}`);
		}
	}

	if (opts.dsFile) {
		const abs = path.resolve(String(opts.dsFile));
		const txt = await fs.readFile(abs, "utf-8");
		let arr: unknown;
		try {
			arr = JSON.parse(txt);
		} catch (e: any) {
			throw new Error(`Failed to parse --ds-file JSON: ${e?.message || String(e)}`);
		}
		if (!Array.isArray(arr)) {
			throw new Error("--ds-file must contain a JSON array of DataSources");
		}
		for (const item of arr) out.push(normalizeDataSource(item));
	}

	return out.length ? out : undefined;
}

/**
 * Registers the 'drives' command and subcommands for managing virtual drives.
 *
 * This command provides functionality for managing virtual drives that connect
 * data sources (such as buckets, gateways, or cloud storage) to Signaloid applications.
 *
 * Available subcommands:
 * - list: List all drives with optional pagination
 * - get: Get details of a specific drive
 * - create: Create a new drive with data sources
 * - update: Update an existing drive's configuration
 * - delete: Delete a drive
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli drives list
 * signaloid-cli drives get --drive-id drive-123
 * signaloid-cli drives create --name MyDrive --ds '{"ResourceID":"bucket-1","ResourceType":"Bucket","Location":"/"}'
 * signaloid-cli drives update --drive-id drive-123 --name UpdatedDrive
 * ```
 */
export default function drives(program: Command) {
	const cmd = program.command("drives").description("Manage drives");

	// signaloid-cli drives list --start-key sk_123 --count 20
	cmd.command("list")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("drives");
				return;
			}

			const spinner = ora("Fetching drives...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination(
					(startKey) => client.drives.list(startKey ? { startKey: String(startKey) } : undefined),
					"Drives",
					targetCount,
					spinner,
					opts.startKey,
				);

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Drives: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("drives", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli drives get --drive-id --drive-id <id>
	cmd.command("get")
		.requiredOption("--drive-id <id>", "Drive ID")
		.action(async (opts) => {
			const id = String(opts.driveId);
			const spinner = ora("Fetching drive...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.drives.getOne(id); // SDK method name
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli drives create --name MyDrive --ds '{"ResourceID":"...","ResourceType":"Bucket","Location":"/"}'
	// or: --ds-file ./datasources.json (array of DataSource)
	cmd.command("create")
		.requiredOption("--name <str>", "Name")
		.option(
			"--ds <json>",
			"DataSource JSON (repeatable)",
			(val: string, acc: string[]) => {
				if (!acc) acc = [] as string[];
				acc.push(String(val));
				return acc;
			},
			[] as string[],
		)
		.option("--ds-file <path>", "Path to JSON array of DataSources")
		.action(async (opts) => {
			const spinner = ora("Creating drive...").start();
			try {
				const client = makeClient(await loadConfig());
				const dataSources = await collectDataSources(opts);

				// DriveRequest requires capitalized keys
				const payload: { Name: string; DataSources: DataSource[] } = {
					Name: String(opts.name),
					DataSources: dataSources ?? [],
				};

				const res = await client.drives.create(payload as any);
				spinner.succeed("Drive created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli drives update --drive-id <id> [--name ...] [--ds ...] [--ds-file ...]
	cmd.command("update")
		.requiredOption("--drive-id <id>", "Drive ID")
		.option("--name <str>", "New name")
		.option(
			"--ds <json>",
			"DataSource JSON (repeatable)",
			(val: string, acc: string[]) => {
				if (!acc) acc = [] as string[];
				acc.push(String(val));
				return acc;
			},
			[] as string[],
		)
		.option("--ds-file <path>", "Path to JSON array of DataSources")
		.action(async (opts) => {
			const id = String(opts.driveId);
			const spinner = ora("Updating drive...").start();
			try {
				const client = makeClient(await loadConfig());

				const patch: Record<string, any> = {};
				if (typeof opts.name === "string") patch.Name = opts.name; // capitalized
				const dataSources = await collectDataSources(opts);
				if (dataSources) patch.DataSources = dataSources;

				const res = await client.drives.update(id, patch as any);
				spinner.succeed("Drive updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli drives delete --drive-id <id>
	cmd.command("delete")
		.requiredOption("--drive-id <id>", "Drive ID")
		.action(async (opts) => {
			const id = String(opts.driveId);
			const spinner = ora("Deleting drive...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.drives.delete(id);
				spinner.succeed("Drive deleted");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});
}
