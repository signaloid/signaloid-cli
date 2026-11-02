import { Command, InvalidArgumentError, Option } from "commander";
import type {
	CoreClass,
	CorePatchRequest,
	CoreRequest,
	DependencyTracking,
	LegacyCorrelationTracking,
	Microarchitecture,
	NativeCoreClass,
	NativeMicroarchitecture,
} from "@signaloid/scce-sdk";
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
import { EXIT_CODES, usageError } from "../../utils/exit-codes";

// Keyed by the SDK types, so the compiler flags a class or mode the SDK adds and these lack.
const CORE_CLASSES = Object.keys({
	C0Pro: true,
	r7i: true,
	"C0-microSD": true,
	"C0-microSD-plus": true,
	"C0-SD": true,
} satisfies Record<CoreClass, true>) as CoreClass[];
const MICROARCHITECTURES = Object.keys({
	Athens: true,
	Rome: true,
	Bypass: true,
	Reference: true,
	Jupiter: true,
	Native: true,
} satisfies Record<Microarchitecture, true>) as Microarchitecture[];
const DEPENDENCY_TRACKING_MODES = Object.keys({
	None: true,
	Basic: true,
	Advanced: true,
} satisfies Record<DependencyTracking, true>) as DependencyTracking[];

// Native-class cores have a fixed Precision of 0 and DependencyTracking of None, which the API fills in.
const NATIVE_CORE_CLASS: NativeCoreClass = "r7i";
const isNativeClass = (coreClass: string): boolean => coreClass === NATIVE_CORE_CLASS;
// The only microarchitecture a native class takes, and it is valid with no other class.
const NATIVE_MICROARCHITECTURE: NativeMicroarchitecture = "Native";
// Native-class and Bypass cores have fixed fields, which the API fills in: Bypass ignores
// Precision and tracks no dependencies.
const BYPASS_MICROARCHITECTURE: Microarchitecture = "Bypass";
const FIXED_PRECISION = 0;
const FIXED_DEPENDENCY_TRACKING: DependencyTracking = "None";
const hasFixedFields = (coreClass: string, microarchitecture: string): boolean =>
	isNativeClass(coreClass) || microarchitecture === BYPASS_MICROARCHITECTURE;

// Older cores carry only CorrelationTracking, which the API renamed to DependencyTracking.
// Autocorrelation is the Basic mode of Athens and Rome, and Disable is None.
const LEGACY_DEPENDENCY_TRACKING: Record<LegacyCorrelationTracking, DependencyTracking> = {
	Autocorrelation: "Basic",
	Disable: "None",
};

// The dependency tracking modes each microarchitecture accepts.
const TRACKING_BY_MICROARCHITECTURE = {
	Athens: ["None", "Basic"],
	Rome: ["None", "Basic"],
	Jupiter: ["Advanced"],
	Bypass: ["None"],
	Reference: ["None"],
	Native: ["None"],
} satisfies Record<Microarchitecture, DependencyTracking[]>;

/** The usage error for a --precision or --dependency-tracking a core with fixed fields refuses, if any. */
function fixedFieldsConflictError(
	subject: string,
	opts: { precision?: number; dependencyTracking?: string },
): string | undefined {
	const conflicts: string[] = [];
	if (opts.precision !== undefined && opts.precision !== FIXED_PRECISION) conflicts.push("--precision");
	if (opts.dependencyTracking !== undefined && opts.dependencyTracking !== FIXED_DEPENDENCY_TRACKING) {
		conflicts.push("--dependency-tracking");
	}
	if (conflicts.length === 0) return undefined;
	return `${subject} takes no ${conflicts.join(" or ")}: its precision is ${FIXED_PRECISION} and its dependency tracking is ${FIXED_DEPENDENCY_TRACKING}.`;
}

/**
 * The usage error for options that do not suit the class, if any. A native class takes only the
 * Native microarchitecture and fixed fields, and Native is valid with no other class.
 */
function nativeConflictError(
	coreClass: string,
	opts: { microarchitecture?: string; precision?: number; dependencyTracking?: string },
): string | undefined {
	if (!isNativeClass(coreClass)) {
		return opts.microarchitecture === NATIVE_MICROARCHITECTURE
			? `The ${NATIVE_MICROARCHITECTURE} microarchitecture works only with the ${NATIVE_CORE_CLASS} class.`
			: undefined;
	}
	if (opts.microarchitecture !== undefined && opts.microarchitecture !== NATIVE_MICROARCHITECTURE) {
		return `The ${coreClass} class takes only the ${NATIVE_MICROARCHITECTURE} microarchitecture.`;
	}
	return fixedFieldsConflictError(`The ${coreClass} class`, opts);
}

/** The usage error for options a Bypass core refuses, if any: it takes only fixed fields. */
function bypassConflictError(
	microarchitecture: string | undefined,
	opts: { precision?: number; dependencyTracking?: string },
): string | undefined {
	return microarchitecture === BYPASS_MICROARCHITECTURE
		? fixedFieldsConflictError(`The ${BYPASS_MICROARCHITECTURE} microarchitecture`, opts)
		: undefined;
}

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
 * signaloid-cli cores create --name MyCore --class C0Pro --precision 32 --microarchitecture Athens --dependency-tracking Basic
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

	// signaloid-cli cores create --name MyCore --class C0Pro --precision 32 --microarchitecture Athens --dependency-tracking Basic
	cmd.command("create")
		.description("Create a new custom core configuration")
		.requiredOption("--name <str>", "Name")
		.addOption(new Option("--class <class>", "Core class").choices(CORE_CLASSES).makeOptionMandatory())
		.option(
			"--precision <n>",
			"Precision (number, required except for the r7i class and the Bypass microarchitecture)",
			wholeNumber,
		)
		.option("--memory <n>", "Memory size (deprecated: the server sets it from the core class)", wholeNumber)
		.addOption(
			new Option("--microarchitecture <arch>", "Microarchitecture")
				.choices(MICROARCHITECTURES)
				.makeOptionMandatory(),
		)
		.addOption(
			new Option(
				"--dependency-tracking <mode>",
				"Dependency tracking (required except for the r7i class and the Bypass microarchitecture)",
			).choices(DEPENDENCY_TRACKING_MODES),
		)
		.action(async (opts) => {
			const conflict = nativeConflictError(opts.class, opts) ?? bypassConflictError(opts.microarchitecture, opts);
			if (conflict) return usageError(conflict);
			if (!isNativeClass(opts.class)) {
				const missing: string[] = [];
				if (!hasFixedFields(opts.class, opts.microarchitecture) && !Number.isFinite(opts.precision)) {
					missing.push("--precision");
				}
				if (!hasFixedFields(opts.class, opts.microarchitecture) && opts.dependencyTracking === undefined) {
					missing.push("--dependency-tracking");
				}
				if (missing.length > 0) {
					const target = `the ${opts.class} class with ${opts.microarchitecture}`;
					return usageError(
						`${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required for ${target}.`,
					);
				}
			}
			const spinner = createSpinner("Creating core...");
			try {
				const client = makeClient(await loadConfig());

				// The API checks which fields the class takes, so the cast only skips the union
				// narrowing. Options left out stay undefined and are not sent.
				const payload = {
					Name: opts.name,
					Class: opts.class,
					Precision: opts.precision,
					Microarchitecture: opts.microarchitecture,
					DependencyTracking: opts.dependencyTracking,
				} as CoreRequest;
				if (Number.isFinite(opts.memory)) payload.MemorySize = opts.memory;

				const res = await client.cores.create(payload);
				spinner.succeed("Core created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create core");
				await handleCliError(e);
			}
		});

	// signaloid-cli cores update --core-id <id> [--name ...] [--class ...] [--precision ...] [--memory ...] [--microarchitecture ...] [--dependency-tracking ...]
	cmd.command("update")
		.description("Update an existing core configuration")
		.requiredOption("--core-id <id>", "Core ID")
		.option("--name <str>", "New name")
		.addOption(new Option("--class <class>", "New class").choices(CORE_CLASSES))
		.option(
			"--precision <n>",
			"New precision (number, required to change an r7i or Bypass core to a microarchitecture that takes one)",
			wholeNumber,
		)
		.option("--memory <n>", "New memory size (deprecated: the server sets it from the core class)", wholeNumber)
		.addOption(
			new Option(
				"--microarchitecture <arch>",
				"New microarchitecture (required to change an r7i core to another class; an r7i core takes only Native)",
			).choices(MICROARCHITECTURES),
		)
		.addOption(
			new Option("--dependency-tracking <mode>", "New dependency tracking").choices(DEPENDENCY_TRACKING_MODES),
		)
		.action(async (opts) => {
			const id = String(opts.coreId);
			// With --class, the arguments alone decide this, so check before fetching the core.
			const conflict =
				(opts.class !== undefined && nativeConflictError(opts.class, opts)) ||
				bypassConflictError(opts.microarchitecture, opts);
			if (conflict) return usageError(conflict);
			const spinner = createSpinner("Updating core...");
			const fail = (message: string) => {
				spinner.fail("Failed to update core");
				usageError(message);
			};
			try {
				const client = makeClient(await loadConfig());

				// PATCH takes the full core body, so start from the stored core and
				// override only the fields the user provided.
				const core = await client.cores.getOne(id);

				const coreClass = typeof opts.class === "string" ? opts.class : core.Class;
				if (coreClass === "C0") {
					return fail(
						"Core class C0 is retired. Pass --class (e.g. C0Pro, which replaced it) to update this core.",
					);
				}
				const toNative = isNativeClass(coreClass);
				const fromNative = isNativeClass(core.Class);
				if (core.Microarchitecture === "Atlas" && opts.microarchitecture === undefined && !toNative) {
					return fail(
						"Microarchitecture Atlas is retired. Pass --microarchitecture (e.g. Rome, which replaced it) to update this core.",
					);
				}

				// Native is the only microarchitecture a native class takes.
				const microarchitecture: string =
					opts.microarchitecture ?? (toNative ? NATIVE_MICROARCHITECTURE : core.Microarchitecture);
				// A native core's stored Native microarchitecture suits no other class, and the fixed
				// Precision of 0 of a native or Bypass core suits no microarchitecture that takes one.
				const toFixedFields = hasFixedFields(coreClass, microarchitecture);
				const fromFixedFields = hasFixedFields(core.Class, core.Microarchitecture);
				const missing: string[] = [];
				if (fromNative && !toNative && opts.microarchitecture === undefined) {
					missing.push("--microarchitecture");
				}
				if (fromFixedFields && !toFixedFields && opts.precision === undefined) {
					missing.push("--precision");
				}
				if (missing.length > 0) {
					const target = fromNative && !toNative ? `the ${coreClass} class` : microarchitecture;
					return fail(
						`Pass ${missing.join(" and ")} to change this ${core.Class} ${core.Microarchitecture} core to ${target}.`,
					);
				}
				// Without --class or --microarchitecture, what the core takes depends on the stored core.
				const storedConflict =
					(opts.class === undefined && nativeConflictError(coreClass, opts)) ||
					bypassConflictError(microarchitecture, opts);
				if (storedConflict) return fail(storedConflict);

				// A native class takes no Precision or DependencyTracking of its own, so the
				// stored values are not carried over to it, and a Bypass core has a Precision
				// of 0. An older core has only the legacy CorrelationTracking, which the PATCH
				// migrates. When the stored mode does not suit the target microarchitecture,
				// use the only mode it accepts, or ask for one.
				let dependencyTracking: DependencyTracking | undefined = opts.dependencyTracking;
				if (!toNative && dependencyTracking === undefined) {
					const accepted: DependencyTracking[] | undefined =
						TRACKING_BY_MICROARCHITECTURE[microarchitecture as Microarchitecture];
					dependencyTracking =
						core.DependencyTracking ??
						(core.CorrelationTracking && LEGACY_DEPENDENCY_TRACKING[core.CorrelationTracking]);
					if (accepted && !(dependencyTracking && accepted.includes(dependencyTracking))) {
						if (accepted.length !== 1) {
							return fail(
								`Dependency tracking ${dependencyTracking ?? "(none)"} does not suit ${microarchitecture}. Pass --dependency-tracking (${accepted.join(" or ")}) to update this core.`,
							);
						}
						dependencyTracking = accepted[0];
					}
				}
				const patch = {
					Name: core.Name,
					Class: coreClass,
					Microarchitecture: microarchitecture,
					...(!toNative && {
						Precision: toFixedFields ? FIXED_PRECISION : core.Precision,
						DependencyTracking: dependencyTracking,
					}),
				} as CorePatchRequest;

				if (typeof opts.name === "string") patch.Name = opts.name;
				if (Number.isFinite(opts.precision)) patch.Precision = opts.precision;
				if (Number.isFinite(opts.memory)) patch.MemorySize = opts.memory;

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
