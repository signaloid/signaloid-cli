import { table, getBorderCharacters } from "table";
import chalk from "chalk";
import { Spinner } from "./spinner";
import { printData } from "./verbosity";

export type OutputFormat = "json" | "table";

/**
 * Fetch items with pagination support using ContinuationKey
 */
export async function fetchWithPagination<T>(
	fetchFunction: (startKey?: string) => Promise<{ ContinuationKey?: string; [key: string]: any }>,
	itemsKey: string,
	targetCount?: number,
	spinner?: Spinner,
	initialStartKey?: string,
): Promise<{ items: T[]; continuationKey?: string }> {
	let allItems: T[] = [];
	let nextKey: string | undefined = initialStartKey;
	let requestCount = 0;

	if (!targetCount) {
		// Single request without pagination
		const res = await fetchFunction(initialStartKey);
		return {
			items: (res as any)[itemsKey] || [],
			continuationKey: res.ContinuationKey,
		};
	}

	// Fetch items using pagination
	while (allItems.length < targetCount) {
		requestCount++;
		const res = await fetchFunction(nextKey);

		const items = (res as any)[itemsKey] || [];
		allItems = allItems.concat(items);

		// Check if we have a continuation key for pagination
		nextKey = res.ContinuationKey;

		// Break if no more items or no continuation token
		if (!nextKey || items.length === 0) {
			break;
		}

		// If we've exceeded the target, we'll trim later
		if (allItems.length >= targetCount) {
			break;
		}
	}

	// Trim to exact count and return with the last continuation key
	return {
		items: allItems.slice(0, targetCount),
		continuationKey: nextKey,
	};
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
		correlation: { key: "CorrelationTracking", header: "Correlation", width: 18 },
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
		path: { key: "path", header: "Path", width: 50 },
		size: { key: "size", header: "Size", width: 12 },
		etag: { key: "etag", header: "Etag", width: 15 },
		modified: { key: "last_modified", header: "Modified", width: 25 },
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
		region: { key: "Region", header: "Region", width: 15 },
		mountPath: { key: "MountPath", header: "Mount Path", width: 30 },
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
		id: { key: "webhookId", header: "Webhook ID", width: 30 },
		url: { key: "url", header: "URL", width: 50 },
		events: { key: "events", header: "Events", width: 30 },
		status: { key: "status", header: "Status", width: 12 },
		created: { key: "createdAt", header: "Created", width: 25 },
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
	buckets: ["id", "name", "account", "region", "mountPath"],
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

			// Special formatters for specific column types
			if (colKey === "status" && value) {
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
