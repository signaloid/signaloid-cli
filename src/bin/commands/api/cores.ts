import { Command, InvalidArgumentError } from "commander";
import type { CoreRequest } from "@signaloid/scce-sdk";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import {
	displayResource,
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData } from "../../utils/verbosity";
import { EXIT_CODES } from "../../utils/exit-codes";

function wholeNumber(value: string): number {
	if (!/^-?\d+$/.test(value.trim())) {
		throw new InvalidArgumentError("must be a whole number");
	}
	return Number(value);
}

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
 * signaloid-cli cores create --name MyCore --class C0 --precision 32 --memory 2048 --microarch Athens --corr Autocorrelation
 * signaloid-cli cores update --core-id core-123 --name UpdatedCore
 * ```
 */
export default function cores(program: Command) {
	const cmd = program.command("cores").description("Manage computation cores and configurations");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	// signaloid-cli cores list [--default | --custom]
	cmd.command("list")
		.description("List available cores (defaults to both default and custom cores)")
		.option("--default", "List only default cores")
		.option("--custom", "List only custom cores")
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("cores");
				return;
			}

			if (opts.default && opts.custom) {
				console.error("Cannot use --default and --custom together.");
				process.exit(EXIT_CODES.USAGE);
			}

			const spinner = createSpinner("Fetching cores...");
			try {
				const client = makeClient(await loadConfig());

				const fetchAll = async (params: { default?: boolean }) => {
					const out: any[] = [];
					let startKey: string | undefined;
					do {
						const res = await client.cores.list({ ...params, ...(startKey ? { startKey } : {}) });
						for (const core of res.Cores || []) out.push(core);
						startKey = res.ContinuationKey;
					} while (startKey);
					return out;
				};

				// Omitting default returns custom cores, passing default true returns default cores.
				const sources: { default?: boolean }[] = opts.default
					? [{ default: true }]
					: opts.custom
						? [{}]
						: [{ default: true }, {}];

				const seen = new Set<string>();
				const allCores: any[] = [];
				for (const src of sources) {
					for (const core of await fetchAll(src)) {
						if (!seen.has(core.CoreID)) {
							seen.add(core.CoreID);
							allCores.push(core);
						}
					}
				}

				spinner.succeed();

				// An empty result is a success, so print the empty structure and exit 0.
				const result = { Cores: allCores, Count: allCores.length };
				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(result, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printData(createCustomTable("cores", allCores, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list cores");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores get --core-id <id>
	cmd.command("get")
		.description("Get details of a specific core")
		.requiredOption("--core-id <id>", "Core ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = createSpinner("Fetching core...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.cores.getOne(id); // SDK method is getOne
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Core: ${id}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get core");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores create --name MyCore --class C0 --precision 32 --memory 2048 --microarch Athens --corr Autocorrelation
	cmd.command("create")
		.description("Create a new custom core configuration")
		.requiredOption("--name <str>", "Name")
		.requiredOption("--class <C0|C0Pro|C0-microSD|C0-microSD-plus|C0-SD>", "Core class")
		.requiredOption("--precision <n>", "Precision (number)", wholeNumber)
		.requiredOption("--memory <n>", "Memory size (number)", wholeNumber)
		.option("--microarchitecture <Athens|Atlas|Bypass|Reference|Jupiter>", "Microarchitecture")
		.option("--correlation-tracking <Autocorrelation|Disable>", "Correlation tracking")
		.action(async (opts) => {
			const spinner = createSpinner("Creating core...");
			try {
				const client = makeClient(await loadConfig());

				const payload: CoreRequest = {
					Name: opts.name,
					Class: opts.class,
					Precision: opts.precision,
					MemorySize: opts.memory,
					Microarchitecture: opts.microarchitecture,
					CorrelationTracking: opts.correlationTracking,
				};

				const res = await client.cores.create(payload);
				spinner.succeed("Core created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create core");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores update --core-id <id> [--name ...] [--class ...] [--precision ...] [--memory ...] [--microarch ...] [--corr ...]
	cmd.command("update")
		.description("Update an existing core configuration")
		.requiredOption("--core-id <id>", "Core ID")
		.option("--name <str>", "New name")
		.option("--class <C0|C0Pro|C0-microSD|C0-microSD-plus|C0-SD>", "New class")
		.option("--precision <n>", "New precision (number)", wholeNumber)
		.option("--memory <n>", "New memory size (number)", wholeNumber)
		.option("--microarchitecture <Athens|Atlas|Bypass|Reference|Jupiter>", "New microarchitecture")
		.option("--correlation-tracking <Autocorrelation|Disable>", "New correlation tracking")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = createSpinner("Updating core...");
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

				const res = await client.cores.update(id, patch);
				spinner.succeed("Core updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update core");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores delete --core-id <id>
	cmd.command("delete")
		.description("Delete a custom core")
		.requiredOption("--core-id <id>", "Core ID")
		.action(async (opts) => {
			const id = String(opts.coreId);
			const spinner = createSpinner("Deleting core...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.cores.delete(id);
				spinner.succeed("Core deleted");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete core");
				await handleCliError(e);
			}
		});
}
