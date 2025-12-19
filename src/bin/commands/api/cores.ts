import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import {
	formatCoresTable,
	displayResource,
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";

/**
 * Registers the 'cores' command and subcommands for managing Signaloid computation cores.
 *
 * This command provides comprehensive functionality for managing Signaloid cores,
 * which define the computational resources and uncertainty tracking configurations
 * for executing probabilistic programs.
 *
 * Available subcommands:
 * - list: List available cores, optionally filtered to default cores
 * - get: Get details of a specific core
 * - create: Create a new custom core configuration
 * - update: Update an existing core's configuration
 * - delete: Delete a custom core
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli cores list --default
 * signaloid-cli cores get --core-id core-123
 * signaloid-cli cores create --name MyCore --class C0 --precision 32 --memory 2048 --microarch Zurich --corr Autocorrelation
 * signaloid-cli cores update --core-id core-123 --name UpdatedCore
 * ```
 */
export default function cores(program: Command) {
	const cmd = program.command("cores").description("Manage cores");

	// signaloid-cli cores list --default
	cmd.command("list")
		.description("List available cores")
		.option("--default", "Only default cores")
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("cores");
				return;
			}

			const spinner = ora("Fetching cores...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.cores.list(
					opts.default === undefined ? undefined : { default: Boolean(opts.default) },
				);

				if (!res.Cores || res.Cores.length === 0) {
					spinner.succeed(
						"No custom cores found. Use 'cores list --default' if you want a list of default cores.",
					);
					process.exit(1);
				}

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					console.log(JSON.stringify(res, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("cores", res.Cores || [], selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores get --core-id <id>
	cmd.command("get")
		.description("Get details of a specific core")
		.requiredOption("--core-id <id>", "Core ID")
		.option("--format <type>", "Output format: json|table", "table")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = ora("Fetching core...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.cores.getOne(id); // SDK method is getOne
				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					console.log(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Core: ${id}`);
				}
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores create --name MyCore --class C0 --precision 32 --memory 2048 --microarch Zurich --corr Autocorrelation
	cmd.command("create")
		.description("Create a new custom core configuration")
		.requiredOption("--name <str>", "Name")
		.requiredOption("--class <C0|C0Pro|C0-microSD|C0-microSD-plus>", "Core class")
		.requiredOption("--precision <n>", "Precision (number)", (v) => parseInt(v, 10))
		.requiredOption("--memory <n>", "Memory size (number)", (v) => parseInt(v, 10))
		.option("--microarchitecture <Zurich|Athens|Bypass|Reference|Jupiter>", "Microarchitecture")
		.option("--correlation-tracking <Autocorrelation|Disable>", "Correlation tracking")
		.action(async (opts) => {
			const spinner = ora("Creating core...").start();
			try {
				const client = makeClient(await loadConfig());

				// CoreRequest uses CAPITALIZED keys per your types
				const payload: {
					Name: string;
					Class: "C0" | "C0Pro" | "C0-microSD" | "C0-microSD-plus";
					Precision: number;
					MemorySize: number;
					Microarchitecture: "Zurich" | "Athens" | "Bypass" | "Reference" | "Jupiter";
					CorrelationTracking: "Autocorrelation" | "Disable";
				} = {
					Name: opts.name,
					Class: opts.class,
					Precision: opts.precision,
					MemorySize: opts.memory,
					Microarchitecture: opts.microarchitecture,
					CorrelationTracking: opts.correlationTracking,
				};

				const res = await client.cores.create(payload);
				spinner.succeed("Core created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				e.message = e.details;
				await handleCliError(e);
			}
		});

	// signaloid-cli cores update --core-id <id> [--name ...] [--class ...] [--precision ...] [--memory ...] [--microarch ...] [--corr ...]
	cmd.command("update")
		.description("Update an existing core configuration")
		.requiredOption("--core-id <id>", "Core ID")
		.option("--name <str>", "New name")
		.option("--class <C0|C0Pro|C0-microSD|C0-microSD-plus>", "New class")
		.option("--precision <n>", "New precision (number)", (v) => parseInt(v, 10))
		.option("--memory <n>", "New memory size (number)", (v) => parseInt(v, 10))
		.option("--microarchitecture <Zurich|Athens|Bypass|Reference|Jupiter>", "New microarchitecture")
		.option("--correlation-tracking <Autocorrelation|Disable>", "New correlation tracking")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = ora("Updating core...").start();
			try {
				const client = makeClient(await loadConfig());

				// SDK types make all fields required for CorePatchRequest, but server
				// typically accepts partials; send only provided fields and cast.
				const core = await client.cores.getOne(id);

				const patch = (({ Name, Class, Precision, MemorySize, Microarchitecture, CorrelationTracking }) => ({
					Name,
					Class,
					Precision,
					MemorySize,
					Microarchitecture,
					CorrelationTracking,
				}))(core);

				if (typeof opts.name === "string") patch.Name = opts.name;
				if (typeof opts.class === "string") patch.Class = opts.class;
				if (Number.isFinite(opts.precision)) patch.Precision = opts.precision;
				if (Number.isFinite(opts.memory)) patch.MemorySize = opts.memory;
				if (typeof opts.microarchitecture === "string") patch.Microarchitecture = opts.microarchitecture;
				if (typeof opts.correlationTracking === "string") patch.CorrelationTracking = opts.correlationTracking;

				const res = await client.cores.update(id, patch as any);
				spinner.succeed("Core updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores delete --core-id <id>
	cmd.command("delete")
		.description("Delete a custom core")
		.requiredOption("--core-id <id>", "Core ID")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = ora("Deleting core...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.cores.delete(id);
				spinner.succeed("Core deleted");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});
}
