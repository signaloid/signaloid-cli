import { Command } from "commander";
import ora from "ora";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { toBuffer } from "../../utils/binary";
import { ensureDir, webReadableToBuffer, writeBinary } from "../../utils/fsx";
import {
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";
import { FileItem } from "@signaloid/scce-sdk";
import { handleCliError } from "../../utils/error-handler";

/**
 * Registers the 'files' command and subcommands for managing files in cloud storage.
 *
 * This command provides comprehensive file management functionality including
 * listing directories, viewing file metadata, uploading, downloading, and deleting files.
 *
 * Available subcommands:
 * - list (alias: ls): List files in a directory with optional pagination
 * - get (alias: stat): Get file metadata without downloading the file
 * - upload: Upload a local file to cloud storage
 * - download: Download a file from cloud storage to local filesystem
 * - mkdir: Create a directory (virtual folder)
 * - delete (alias: rm): Delete a file or directory from cloud storage
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli files list --path datasets/
 * signaloid-cli files get --path datasets/myfile.csv
 * signaloid-cli files upload --path datasets/data.csv --from ./data.csv
 * signaloid-cli files download --path datasets/data.csv --out ./downloads
 * signaloid-cli files mkdir --path datasets/newfolder/
 * signaloid-cli files delete --path datasets/old-file.csv
 * ```
 */
export default function files(program: Command) {
	const cmd = program.command("files").description("Manage files by path");

	cmd.command("list")
		.alias("ls")
		.description("List files (optionally under a path)")
		.option("--path <p>", "Directory path (e.g., 'datasets/' )")
		.option("--start-key <token>", "Pagination cursor token")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("files");
				return;
			}

			const spinner = ora("Listing files...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination(
					(startKey) =>
						client.files.list({
							path: opts.path,
							startKey: startKey || opts.startKey,
						}),
					"items",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Files: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("files", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list files");
				await handleCliError(e);
			}
		});

	cmd.command("get")
		.alias("stat")
		.description("Get file metadata (no download)")
		.requiredOption("--path <path>", "Path")
		.action(async (opts) => {
			const p = String(opts.path);
			const spinner = ora("Fetching metadata...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.files.get(p, false); // FileItem
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to stat file");
				await handleCliError(e);
			}
		});

	cmd.command("download")
		.description("Download a file by path")
		.requiredOption("--path <path>", "Path")
		.option("--out <dir>", "Output directory", "./downloads")
		.option("--name <filename>", "Save as filename (defaults to last segment)")
		.action(async (opts) => {
			const p = String(opts.path);
			const spinner = ora("Downloading...").start();
			try {
				const client = makeClient(await loadConfig());

				const raw = await client.files.get(p, true);
				const resp = JSON.parse(String(raw)) as FileItem;
				let fileBuf: Buffer;
				let suggestedNameFromHeaders: string | undefined;

				if (
					resp &&
					typeof resp === "object" &&
					"download_url" in resp &&
					typeof resp.download_url === "string"
				) {
					const url = resp.download_url as string;
					const r = await fetch(url, { method: "GET" });
					if (!r.ok || !r.body) {
						throw new Error(`Fetch failed with status ${r.status} ${r.statusText}`);
					}

					const cd = r.headers.get("content-disposition") || "";
					const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
					if (m) suggestedNameFromHeaders = decodeURIComponent((m[1] || m[2] || "").trim());

					fileBuf = await webReadableToBuffer(r.body);
				} else {
					fileBuf = await toBuffer(resp);
				}

				const outDir = path.resolve(opts.out || `.${path.sep}`);
				await ensureDir(outDir);

				const base = opts.name || suggestedNameFromHeaders || path.basename(p) || "download.bin";

				const savedPath = await writeBinary(outDir, base, fileBuf);

				spinner.succeed("Saved 1 file");
				console.log(JSON.stringify([savedPath], null, 2));
			} catch (e: any) {
				spinner.fail("Failed to download file");
				await handleCliError(e);
			}
		});

	cmd.command("upload")
		.description("Upload a local file or text to a remote path")
		.requiredOption("--path <remotePath>", "Destination path (e.g., 'datasets/data.csv')")
		.option("--from <localFile>", "Local file to upload")
		.option("--text <string>", "Inline text content to upload")
		.action(async (opts) => {
			const spinner = ora("Uploading...").start();
			try {
				if (!opts.from && !opts.text) {
					throw new Error("Provide --from <localFile> or --text <string>");
				}
				const client = makeClient(await loadConfig());

				let content: File | Blob | ArrayBuffer | string;
				if (opts.text) {
					content = String(opts.text);
				} else {
					const abs = path.resolve(String(opts.from));
					const buf = await fs.readFile(abs);
					content = new Uint8Array(buf).buffer;
				}

				const res = await client.files.upload(opts.path, content);
				spinner.succeed("File uploaded");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to upload");
				await handleCliError(e);
			}
		});

	cmd.command("mkdir")
		.description("Create a directory at path (virtual folder)")
		.requiredOption("--path <path>", "Path")
		.action(async (opts) => {
			const p = String(opts.path);
			const spinner = ora("Creating directory...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.files.createDirectory(p);
				spinner.succeed("Directory created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create directory");
				await handleCliError(e);
			}
		});

	cmd.command("delete")
		.alias("rm")
		.description("Delete a file or directory")
		.requiredOption("--path <path>", "Path")
		.option("--recursive", "Recursively delete directory contents")
		.option("--directory", "Path is directory (not a file)")
		.action(async (opts) => {
			const p = String(opts.path);
			const spinner = ora("Deleting...").start();
			try {
				if (opts.recursive && opts.directory === undefined) {
					opts.directory = true;
				}

				const client = makeClient(await loadConfig());
				const res = await client.files.delete(p, {
					recursive: Boolean(opts.recursive),
					directory: Boolean(opts.directory),
				});
				spinner.succeed("Deleted");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete");
				await handleCliError(e);
			}
		});
}
