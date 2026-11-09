import { table, getBorderCharacters } from "table";
import chalk from "chalk";
import { ERROR_CODES, SdkError, paginate } from "@signaloid/scce-sdk";
import type { PageCursor, PaginatedResponse, PaginationQueryParams } from "@signaloid/scce-sdk";
import { Command, Option } from "commander";
import { printData, printError, printInfo } from "./verbosity";
import { parsePositiveInt } from "./validation";
import { EXIT_CODES } from "./exit-codes";
import type { Spinner } from "./spinner";

export type OutputFormat = "json" | "table";

/** `--limit` help for a listing whose page size is `defaultSize` by default, and at most `max`. */
export function limitHelp(defaultSize: number, max = 100): string {
	return `Items per request, at most ${max} (default ${defaultSize})`;
}

/**
 * Adds the pagination options of a listing: `--cursor`, the deprecated `--start-key` unless
 * `startKey` is false (the two conflict), `--count`, and `--limit` with `limitHelp`. Pass
 * `startKey: false` for a listing that never had `startKey`.
 */
export function addPaginationOptions(
	cmd: Command,
	{
		limitHelp: help = limitHelp(25),
		startKey = true,
		filtersAfterLimit = false,
	}: { limitHelp?: string; startKey?: boolean; filtersAfterLimit?: boolean } = {},
): Command {
	const cursor = new Option(
		"--cursor <cursor>",
		"Resume a listing from the Cursor value of the previous output, with the same filters",
	);
	cmd.addOption(startKey ? cursor.conflicts("startKey") : cursor);
	if (startKey) {
		cmd.addOption(
			new Option(
				"--start-key <key>",
				"Deprecated, use --cursor. Resume from the ContinuationKey of the previous output",
			),
		);
	}
	cmd.option(
		"--count <n>",
		filtersAfterLimit
			? "Number of items to fetch, across pages. With --status, each request reads a full page, so the output can hold more"
			: "Number of items to fetch, across pages. The output's Cursor resumes after the last one",
		parsePositiveInt,
	);
	return cmd.option("--limit <n>", help, parsePositiveInt);
}

/** The pagination options of a listing. Parsed command options carry these same names. */
export type PaginationOptions = PaginationQueryParams & {
	/** Without it, one page is fetched. */
	count?: number;
	/**
	 * The API filters a page after applying `limit`, as builds and tasks do with `--status`.
	 * Then a page that asks only for the items still needed can return far fewer, so each
	 * request asks for a full page instead, and the result can hold more than `count`.
	 */
	filtersAfterLimit?: boolean;
	/**
	 * False for a listing without `--start-key`, whose output then leaves out the API's
	 * `ContinuationKey`, as no option of the command takes it.
	 */
	continuationKey?: boolean;
};

/**
 * Where the next listing resumes: pass `Cursor` as `--cursor`, or the older `ContinuationKey` as
 * `--start-key`. Neither is there on the last page.
 */
type ResumeCursor = { Cursor?: string; ContinuationKey?: string };

/**
 * What a listing read. `stalled` is the error message when the API stopped advancing it, in
 * which case `items` are those read so far, `next` is empty, and the exit code is an error.
 */
export type ListingResult<T> = { items: T[]; next: ResumeCursor; stalled?: string; lastPage?: Page };

type Page = PaginatedResponse & Record<string, any>;

function resumeCursorOf(page: Page | undefined, continuationKey: boolean): ResumeCursor {
	if (!page) return {};
	return {
		...(page.Pagination?.Links.Next?.Cursor && { Cursor: page.Pagination.Links.Next.Cursor }),
		...(continuationKey && page.ContinuationKey && { ContinuationKey: page.ContinuationKey }),
	};
}

/**
 * Fetch items from a paginated listing, with the SDK's `paginate()`.
 *
 * Without `count` it makes one request. With it, it follows the listing until it has `count`
 * items or the listing ends. Each request asks for no more items than are still needed, so
 * the result has at most `count` items and `next` resumes right after the last one. A page can
 * be short or empty and still not be the last, so only the end of the listing stops it early.
 * An API without `Pagination` can ignore `limit` and return more items.
 */
export async function fetchWithPagination<T>(
	fetchPage: (query: PaginationQueryParams) => Promise<Page>,
	itemsKey: string,
	{ count, cursor, startKey, limit, filtersAfterLimit, continuationKey = true }: PaginationOptions = {},
): Promise<ListingResult<T>> {
	const firstCursor: PageCursor = { ...(cursor && { cursor }), ...(startKey && { startKey }) };
	const items: T[] = [];
	let lastPage: Page | undefined;

	const pages = paginate((position) => {
		const remaining = count && !filtersAfterLimit ? count - items.length : undefined;
		const size = remaining === undefined ? limit : Math.min(limit ?? remaining, remaining);
		return fetchPage({ ...position, ...(size !== undefined && { limit: size }) });
	}, firstCursor);
	try {
		for await (const page of pages) {
			// An engine without `Pagination` ignores `cursor`, so its page would be the first one
			// again, passed off as the next.
			if (cursor && !lastPage && !page.Pagination) {
				throw new Error(
					"This Signaloid Cloud Compute Engine does not take --cursor. Pass the ContinuationKey of the previous output as --start-key instead.",
				);
			}
			lastPage = page;
			items.push(...(page[itemsKey] ?? []));
			if (!count || items.length >= count) break;
		}
	} catch (error) {
		// The API stopped advancing the listing. The command shows what was read, and
		// finishListingSpinner() reports the stall once its spinner has stopped.
		if (!(error instanceof SdkError && error.code === ERROR_CODES.PAGINATION_STALLED)) throw error;
		return { items, next: {}, stalled: `${error.message} Showing the items read so far.`, lastPage };
	}
	return { items, next: resumeCursorOf(lastPage, continuationKey), lastPage };
}

/**
 * The JSON output of a paginated listing: the items under `itemsKey`, their `Count`, then where
 * to resume.
 */
export function paginatedOutput<T>(itemsKey: string, result: ListingResult<T>) {
	return { [itemsKey]: result.items, Count: result.items.length, ...result.next };
}

/**
 * Prints the items of a listing as a table on stdout. When more items remain, it then tells on
 * stderr how to resume, as a table has no room for the cursor. On the last page, it adds nothing.
 */
export function printListingTable<T>(
	resource: keyof typeof AVAILABLE_COLUMNS,
	result: ListingResult<T>,
	columns?: string[] | null,
) {
	printData(createCustomTable(resource, result.items, columns));
	if (result.next.Cursor) printInfo(`More items: --cursor ${result.next.Cursor}`);
	else if (result.next.ContinuationKey) printInfo(`More items: --start-key ${result.next.ContinuationKey}`);
}

/** Prints `paginatedOutput()` as JSON, after the fields of `extra`, such as the parent's ID. */
export function printListing<T>(itemsKey: string, result: ListingResult<T>, extra: Record<string, unknown> = {}) {
	printData(JSON.stringify({ ...extra, ...paginatedOutput(itemsKey, result) }, null, 2));
}

/**
 * Stops the spinner of a listing. When the API stopped advancing it, the spinner fails, the
 * error message follows, and the exit code is an error, so a script does not take the missing
 * resume cursor for the end of the listing.
 */
export function finishListingSpinner(spinner: Spinner, result: { stalled?: string }): void {
	if (result.stalled === undefined) {
		spinner.succeed();
		return;
	}
	spinner.fail();
	printError(result.stalled);
	process.exitCode = EXIT_CODES.ERROR;
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping the order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/**
 * Lists a resource whose listing returns only IDs (buckets, drives), then fetches each one, a
 * few at a time. An API without `Pagination` ignores `limit` here and can return more IDs than
 * `count`. Its ContinuationKey is the last ID, so the IDs are trimmed to `count` and the
 * listing resumes after the last one kept. A `Cursor` cannot be moved that way, so a listing
 * that has one is not trimmed.
 */
export async function listByIds<R>(
	listPage: (query: PaginationQueryParams) => Promise<Page>,
	idsKey: string,
	getOne: (id: string) => Promise<R>,
	options: PaginationOptions,
): Promise<ListingResult<R>> {
	let { items: ids, next, stalled } = await fetchWithPagination<string>(listPage, idsKey, options);
	// A stalled listing has no reliable place to resume, so it gets no ContinuationKey.
	if (!stalled && options.count && ids.length > options.count && !next.Cursor) {
		ids = ids.slice(0, options.count);
		next = { ContinuationKey: ids[ids.length - 1] };
	}
	// The last page holds IDs, not the items, so it is not passed on.
	return { items: await mapWithConcurrency(ids, 8, getOne), next, stalled };
}

/**
 * Column configuration for customizable table output
 */
export interface ColumnConfig {
	key: string;
	header: string;
	formatter?: (value: any, row: any) => string;
	width?: number;
}

/**
 * Available columns for different resource types
 */
export const AVAILABLE_COLUMNS = {
	builds: {
		id: { key: "BuildID", header: "Build ID", width: 30 },
		status: { key: "Status", header: "Status", width: 15 },
		type: { key: "Application.Type", header: "Type", width: 20 },
		typeDetails: { key: "_typeDetails", header: "Type Details" },
		isPublic: { key: "IsPublic", header: "Public", width: 10 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
		updated: { key: "UpdatedAt", header: "Updated", width: 25 },
		duration: { key: "_duration", header: "Duration", width: 12 },
		coreSpecs: { key: "BuildCoreSpecs", header: "Core Specs", width: 40 },
	},
	tasks: {
		id: { key: "TaskID", header: "Task ID", width: 30 },
		buildId: { key: "BuildID", header: "Build ID", width: 30 },
		status: { key: "Status", header: "Status", width: 15 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
		updated: { key: "UpdatedAt", header: "Updated", width: 25 },
		duration: { key: "_duration", header: "Duration", width: 12 },
	},
	cores: {
		id: { key: "CoreID", header: "Core ID", width: 30 },
		name: { key: "Name", header: "Name", width: 25 },
		class: { key: "Class", header: "Class", width: 20 },
		precision: { key: "Precision", header: "Precision", width: 12 },
		memory: { key: "MemorySize", header: "Memory", width: 12 },
		microarch: { key: "Microarchitecture", header: "Microarch", width: 15 },
		dependency: {
			key: "DependencyTracking",
			header: "Dependency",
			width: 18,
			// Older cores carry only the legacy CorrelationTracking that the API renamed.
			formatter: (value: any, row: any) => String(value ?? row.CorrelationTracking ?? "N/A"),
		},
	},
	repos: {
		id: { key: "RepositoryID", header: "Repo ID", width: 30 },
		url: { key: "RemoteURL", header: "Remote URL", width: 60 },
		core: { key: "Core", header: "Core", width: 30 },
		branch: { key: "Branch", header: "Branch", width: 15 },
		commit: { key: "Commit", header: "Commit", width: 15 },
		buildDir: { key: "BuildDirectory", header: "Build Dir", width: 20 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
		updated: { key: "UpdatedAt", header: "Updated", width: 25 },
	},
	files: {
		path: { key: "Path", header: "Path", width: 50 },
		size: { key: "Size", header: "Size", width: 12 },
		etag: { key: "ETag", header: "Etag", width: 15 },
		modified: { key: "LastModified", header: "Modified", width: 25 },
	},
	keys: {
		id: { key: "KeyID", header: "Key ID", width: 30 },
		name: { key: "Name", header: "Name", width: 25 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
		validUntil: { key: "ValidUntil", header: "Valid Until", width: 25 },
		lastUsed: { key: "LastUsed", header: "Last Used", width: 25 },
	},
	buckets: {
		id: { key: "BucketID", header: "Bucket ID", width: 30 },
		name: { key: "Name", header: "Name", width: 25 },
		account: { key: "Account", header: "Account", width: 30 },
		read: { key: "Read", header: "Read", width: 8 },
		write: { key: "Write", header: "Write", width: 8 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
	},
	drives: {
		id: { key: "DriveID", header: "Drive ID", width: 30 },
		name: { key: "Name", header: "Name", width: 25 },
		dataSources: { key: "DataSources", header: "Data Sources", width: 40 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
		updated: { key: "UpdatedAt", header: "Updated", width: 25 },
	},
	webhooks: {
		id: { key: "WebhookID", header: "Webhook ID", width: 30 },
		url: { key: "URL", header: "URL", width: 50 },
		events: { key: "Events", header: "Events", width: 30 },
		status: { key: "Status", header: "Status", width: 12 },
		created: { key: "CreatedAt", header: "Created", width: 25 },
	},
};

/**
 * Default column sets for each resource type
 */
export const DEFAULT_COLUMNS = {
	builds: ["id", "status", "type", "isPublic", "created"],
	tasks: ["id", "buildId", "status", "created", "duration"],
	cores: ["id", "name", "class", "precision", "memory", "microarch"],
	repos: ["id", "url", "core", "branch"],
	files: ["path", "size", "etag", "modified"],
	keys: ["id", "name", "created", "validUntil"],
	buckets: ["id", "name", "account", "read", "write"],
	drives: ["id", "name", "created", "updated"],
	webhooks: ["id", "url", "status", "created"],
};

/**
 * Parse column selection string into array
 */
export function parseColumns(columnString?: string): string[] | null {
	if (!columnString) return null;
	return columnString
		.split(",")
		.map((c) => c.trim())
		.filter(Boolean);
}

/**
 * Show available columns for a resource type
 */
export function showAvailableColumns(resourceType: keyof typeof AVAILABLE_COLUMNS): void {
	const columns = AVAILABLE_COLUMNS[resourceType];
	printData(chalk.bold.cyan(`\nAvailable columns for ${resourceType}:\n`));

	const columnList = Object.entries(columns).map(([key, config]) => [key, config.header]);

	const helpTable = table(
		[
			[chalk.cyan.bold("Column Key"), chalk.cyan.bold("Display Name")],
			...columnList.map(([key, header]) => [chalk.yellow(key), header]),
		],
		{
			border: getBorderCharacters("ramac"),
		},
	);

	printData(helpTable);
	printData(chalk.gray(`\nDefault columns: ${DEFAULT_COLUMNS[resourceType].join(", ")}`));
	printData(chalk.gray(`\nUsage: --columns ${DEFAULT_COLUMNS[resourceType].slice(0, 3).join(",")}`));
}

/**
 * Get color for status based on status string
 */
function getStatusColor(status?: string): "green" | "yellow" | "red" | "blue" | "gray" {
	const s = (status || "").toLowerCase();
	if (s.includes("completed") || s.includes("success")) return "green";
	if (s.includes("progress") || s.includes("running") || s.includes("initialising")) return "yellow";
	if (s.includes("failed") || s.includes("error") || s.includes("cancelled") || s.includes("stopped")) return "red";
	if (s.includes("accepted") || s.includes("pending")) return "blue";
	return "gray";
}

/**
 * Format date to locale string
 */
function formatDate(date?: string | number): string {
	if (!date) return "N/A";

	try {
		let timestamp: number;

		if (typeof date === "string") {
			const asNumber = Number(date);
			if (isNaN(asNumber)) {
				// Try parsing as ISO string
				timestamp = Date.parse(date);
			} else {
				// Determine if it's seconds or milliseconds
				timestamp = asNumber < 1e12 ? asNumber * 1000 : asNumber;
			}
		} else {
			// Determine if numeric input is seconds or milliseconds
			timestamp = date < 1e12 ? date * 1000 : date;
		}

		const d = new Date(timestamp);
		if (isNaN(d.getTime())) return "Invalid date";

		// Format: DD-Month-YYYY eg. 10-Oct-2025
		const day = String(d.getDate()).padStart(2, "0");
		const month = d.toLocaleString("en-GB", { month: "short" });
		const year = d.getFullYear();

		return `${day}-${month}-${year}`;
	} catch {
		return "Invalid date";
	}
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes?: number): string {
	if (bytes === undefined || bytes === null) return "N/A";
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate duration between two timestamps in milliseconds
 */
function calculateDuration(start?: string | number, end?: string | number): string {
	if (!start || !end) return "N/A";
	try {
		const startTime = new Date(start).getTime();
		const endTime = new Date(end).getTime();
		const diff = endTime - startTime;

		if (diff < 0) return "N/A";

		return `${diff} ms`;
	} catch {
		return "N/A";
	}
}

/**
 * Format key from camelCase/PascalCase to Title Case
 */
function formatKey(key: string): string {
	return (
		key
			// Insert space before capital letters that are followed by lowercase letters
			.replace(/([A-Z])([A-Z])([a-z])/g, "$1 $2$3")
			// Insert space before capital letters that follow lowercase letters
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			// Capitalize first letter
			.replace(/^./, (str) => str.toUpperCase())
			.trim()
	);
}

/**
 * Format value with appropriate styling
 */
function formatValue(value: any): string {
	if (value === null || value === undefined) return chalk.gray("N/A");
	if (typeof value === "boolean") return value ? chalk.green("Yes") : chalk.red("No");
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

/**
 * Create a table with data
 */
function createTable(headers: string[], rows: string[][], columnKeys?: string[]): string {
	const data = [headers.map((h) => chalk.cyan.bold(h)), ...rows];

	const config: any = {
		border: getBorderCharacters("ramac"),
		drawHorizontalLine: (lineIndex: number, rowCount: number) => {
			return lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount;
		},
	};

	// Add column-specific configurations for special columns
	if (columnKeys && columnKeys.length > 0) {
		config.columns = {};
		columnKeys.forEach((colKey, index) => {
			// Only apply width constraint and wrapping to typeDetails column
			if (colKey === "typeDetails") {
				config.columns[index] = { width: 120, wrapWord: true };
			}
		});
	}

	return table(data, config);
}

/**
 * Create a customizable table with selected columns
 */
export function createCustomTable(
	resourceType: keyof typeof AVAILABLE_COLUMNS,
	data: any[],
	selectedColumns?: string[] | null,
): string {
	if (!data || data.length === 0) {
		return chalk.yellow(`No ${resourceType} found.`);
	}

	// Use provided columns or defaults
	const columnsToShow = selectedColumns || DEFAULT_COLUMNS[resourceType];
	const availableCols = AVAILABLE_COLUMNS[resourceType];

	// Build headers and rows based on selected columns
	const headers: string[] = [];
	const columnKeys: string[] = [];

	for (const colKey of columnsToShow) {
		const colDef = (availableCols as any)[colKey];
		if (colDef) {
			headers.push(colDef.header);
			columnKeys.push(colKey);
		}
	}

	const rows = data.map((item) => {
		return columnKeys.map((colKey) => {
			const colDef = (availableCols as any)[colKey];

			// Handle nested properties (e.g., "Application.Type")
			let value;
			if (colDef.key.includes(".")) {
				const keys = colDef.key.split(".");
				value = keys.reduce((obj: any, key: string) => obj?.[key], item);
			} else {
				value = item[colDef.key];
			}

			// Column-specific formatters first, then special formatters for specific column types
			if (colDef.formatter) {
				return colDef.formatter(value, item);
			} else if (colKey === "status" && value) {
				const statusColor = getStatusColor(value);
				return chalk[statusColor](value || "Unknown");
			} else if (colKey === "type" && value) {
				// For builds, if type is "repository", add the RemoteURL in parentheses
				if (value.toLowerCase() === "repository" && item.Application?.Repository?.RemoteURL) {
					return `${value} (${item.Application.Repository.RemoteURL})`;
				}
				return String(value);
			} else if (
				(colKey === "created" ||
					colKey === "updated" ||
					colKey === "modified" ||
					colKey === "validUntil" ||
					colKey === "lastUsed") &&
				value
			) {
				return formatDate(value);
			} else if (colKey === "size" && value !== undefined) {
				return formatBytes(value);
			} else if (colKey === "memory" && value !== undefined) {
				return `${value} B`;
			} else if (colKey === "duration") {
				// Special computed column
				return calculateDuration(item.CreatedAt, item.UpdatedAt);
			} else if (colKey === "typeDetails") {
				// Special computed column for builds - show Repository or SourceCode details based on type
				const appType = item.Application?.Type?.toLowerCase();
				let details;
				if (appType === "repository" && item.Application?.Repository) {
					details = item.Application.Repository;
				} else if (appType === "sourcecode" && item.Application?.SourceCode) {
					details = item.Application.SourceCode;
				}
				return details ? JSON.stringify(details) : "N/A";
			} else if (colKey === "coreSpecs" && value) {
				// Format object fields as JSON string
				return typeof value === "object" ? JSON.stringify(value) : String(value);
			} else if ((colKey === "read" || colKey === "write" || colKey === "isPublic") && value !== undefined) {
				// Format boolean fields
				return value ? chalk.green("Yes") : chalk.red("No");
			} else if (colKey === "dataSources" && value) {
				// Format DataSources array
				return typeof value === "object" ? JSON.stringify(value) : String(value);
			}

			return value !== undefined && value !== null ? String(value) : "N/A";
		});
	});

	return createTable(headers, rows, columnKeys);
}

/**
 * Display a single resource in a readable format
 */
export function displayResource(resource: any, title?: string): void {
	if (title) {
		printData(chalk.bold.cyan(`\n${title}\n`));
	}

	const rows: string[][] = [];

	Object.entries(resource).forEach(([key, value]) => {
		const formattedKey = chalk.cyan(formatKey(key));
		const formattedValue = formatValue(value);
		rows.push([formattedKey, formattedValue]);
	});

	// wrapWord seems to be eating out characters especially in complex
	// cases like printing the transitions of a task
	const output = table(rows, {
		border: getBorderCharacters("ramac"),
		columns: {
			0: { width: 25 },
			1: { width: 180, wrapWord: false },
		},
	});

	printData(output);
}
