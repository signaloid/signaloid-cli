import { table, getBorderCharacters } from "table";
import chalk from "chalk";
import ora from "ora";

export type OutputFormat = "json" | "table";

/**
 * Fetch items with pagination support using ContinuationKey
 */
export async function fetchWithPagination<T>(
	fetchFunction: (startKey?: string) => Promise<{ ContinuationKey?: string; [key: string]: any }>,
	itemsKey: string,
	targetCount?: number,
	spinner?: ReturnType<typeof ora>,
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
	}
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
	console.log(chalk.bold.cyan(`\nAvailable columns for ${resourceType}:\n`));

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

	console.log(helpTable);
	console.log(chalk.gray(`\nDefault columns: ${DEFAULT_COLUMNS[resourceType].join(", ")}`));
	console.log(chalk.gray(`\nUsage: --columns ${DEFAULT_COLUMNS[resourceType].slice(0, 3).join(",")}`));
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
 * Truncate string to max length
 */
function truncate(str?: string, maxLen: number = 50): string {
	if (!str) return "N/A";
	return str.length > maxLen ? str.substring(0, maxLen - 3) + "..." : str;
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
 * Guess file type from filename extension
 */
function guessFileType(filename?: string): string {
	if (!filename) return "Unknown";
	const ext = filename.split(".").pop()?.toLowerCase();

	const typeMap: Record<string, string> = {
		c: "C Source",
		cpp: "C++ Source",
		h: "Header",
		py: "Python",
		js: "JavaScript",
		ts: "TypeScript",
		json: "JSON",
		csv: "CSV",
		txt: "Text",
		md: "Markdown",
		png: "Image",
		jpg: "Image",
		pdf: "PDF",
	};

	return typeMap[ext || ""] || "File";
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
 * Format a list of builds as a table
 */
export function formatBuildsTable(builds: any[]): string {
	if (!builds || builds.length === 0) {
		return chalk.yellow("No builds found.");
	}

	const headers = ["Build ID", "Status", "Language", "Created", "Updated"];
	const rows = builds.map((build) => {
		const statusColor = getStatusColor(build.Status);
		return [
			build.BuildID || "N/A",
			chalk[statusColor](build.Status || "Unknown"),
			build.Language || "N/A",
			formatDate(build.CreatedAt),
			formatDate(build.UpdatedAt),
		];
	});

	return createTable(headers, rows);
}

/**
 * Format a list of tasks as a table
 */
export function formatTasksTable(tasks: any[]): string {
	if (!tasks || tasks.length === 0) {
		return chalk.yellow("No tasks found.");
	}

	const headers = ["Task ID", "Build ID", "Status", "Created", "Duration"];
	const rows = tasks.map((task) => {
		const statusColor = getStatusColor(task.Status);
		const duration = calculateDuration(task.CreatedAt, task.UpdatedAt);

		return [
			task.TaskID || "N/A",
			task.BuildID || "N/A",
			chalk[statusColor](task.Status || "Unknown"),
			formatDate(task.CreatedAt),
			duration,
		];
	});

	return createTable(headers, rows);
}

/**
 * Format cores list as a table
 */
export function formatCoresTable(cores: any[]): string {
	if (!cores || cores.length === 0) {
		return chalk.yellow("No cores found.");
	}

	const headers = ["Core ID", "Name", "Class", "Precision", "Memory", "Microarch"];
	const rows = cores.map((core) => [
		core.CoreID || "N/A",
		core.Name || "N/A",
		core.Class || "N/A",
		core.Precision?.toString() || "N/A",
		core.MemorySize ? `${core.MemorySize} B` : "N/A",
		core.Microarchitecture || "N/A",
	]);

	return createTable(headers, rows);
}

/**
 * Format repositories as a table
 */
export function formatReposTable(repos: any[]): string {
	if (!repos || repos.length === 0) {
		return chalk.yellow("No repositories found.");
	}

	const headers = ["Repo ID", "Name", "URL", "Branch", "Created"];
	const rows = repos.map((repo) => [
		repo.RepositoryID || "N/A",
		repo.Name || "N/A",
		repo.URL || "N/A",
		repo.Branch || "main",
		formatDate(repo.CreatedAt),
	]);

	return createTable(headers, rows);
}

/**
 * Format files list as a table
 */
export function formatFilesTable(files: any[]): string {
	console.log("Files", files);

	if (!files || files.length === 0) {
		return chalk.yellow("No files found.");
	}

	const headers = ["Path", "Size", "Etag", "Last Modified"];
	const rows = files.map((file) => [
		file.Path || "N/A",
		formatBytes(file.Size),
		file.Etag || guessFileType(file.Name),
		formatDate(file.LastModified || file.UpdatedAt),
	]);

	return createTable(headers, rows);
}

/**
 * Format API keys as a table
 */
export function formatKeysTable(keys: any[]): string {
	if (!keys || keys.length === 0) {
		return chalk.yellow("No API keys found.");
	}

	const headers = ["Key ID", "Name", "Created", "Valid Until", "Status"];
	const rows = keys.map((key) => {
		const isExpired = key.ValidUntil && new Date(key.ValidUntil) < new Date();
		const status = isExpired ? chalk.red("Expired") : chalk.green("Active");

		return [
			truncate(key.KeyID || key.ID, 30) || "N/A",
			truncate(key.Name, 30) || "N/A",
			formatDate(key.CreatedAt),
			key.ValidUntil ? formatDate(key.ValidUntil) : chalk.gray("Never"),
			status,
		];
	});

	return createTable(headers, rows);
}

/**
 * Format buckets as a table
 */
export function formatBucketsTable(buckets: any[]): string {
	if (!buckets || buckets.length === 0) {
		return chalk.yellow("No buckets found.");
	}

	const headers = ["Bucket ID", "Name", "Account", "Region", "Read", "Write"];
	const rows = buckets.map((bucket) => [
		truncate(bucket.BucketID || bucket.ID, 30) || "N/A",
		truncate(bucket.Name, 25) || "N/A",
		truncate(bucket.Account, 20) || "N/A",
		bucket.Region || "N/A",
		bucket.Read ? chalk.green("✓") : chalk.red("✗"),
		bucket.Write ? chalk.green("✓") : chalk.red("✗"),
	]);

	return createTable(headers, rows);
}

/**
 * Format drives as a table
 */
export function formatDrivesTable(drives: any[]): string {
	if (!drives || drives.length === 0) {
		return chalk.yellow("No drives found.");
	}

	const headers = ["Drive ID", "Name", "Data Sources", "Created"];
	const rows = drives.map((drive) => {
		const dsCount = Array.isArray(drive.DataSources) ? drive.DataSources.length : 0;
		return [
			truncate(drive.DriveID || drive.ID, 30) || "N/A",
			truncate(drive.Name, 30) || "N/A",
			dsCount.toString(),
			formatDate(drive.CreatedAt),
		];
	});

	return createTable(headers, rows);
}

/**
 * Format webhooks as a table
 */
export function formatWebhooksTable(webhooks: any[]): string {
	if (!webhooks || webhooks.length === 0) {
		return chalk.yellow("No webhooks found.");
	}

	const headers = ["Webhook ID", "URL", "Events", "Status", "Created"];
	const rows = webhooks.map((webhook) => {
		const eventCount = Array.isArray(webhook.Events) ? webhook.Events.length : 0;
		const statusColor = webhook.Status === "active" ? "green" : "red";

		return [
			truncate(webhook.WebhookID || webhook.ID, 30) || "N/A",
			truncate(webhook.URL, 40) || "N/A",
			eventCount.toString(),
			chalk[statusColor](webhook.Status || "Unknown"),
			formatDate(webhook.CreatedAt),
		];
	});

	return createTable(headers, rows);
}

/**
 * Display a single resource in a readable format
 */
export function displayResource(resource: any, title?: string): void {
	if (title) {
		console.log(chalk.bold.cyan(`\n${title}\n`));
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

	console.log(output);
}

/**
 * Display output based on format preference
 */
export function displayOutput(data: any, format: OutputFormat = "json"): void {
	if (format === "json") {
		console.log(JSON.stringify(data, null, 2));
	} else {
		// Default to JSON if no specific formatter is available
		console.log(JSON.stringify(data, null, 2));
	}
}
