import { Command } from "commander";
import { loadConfig } from "../../utils/config";
import { handleCliError } from "../../utils/error-handler";
import { addLearnMore, useGhStyleHelp } from "../../utils/help-formatter";
import {
	createCustomTable,
	displayResource,
	fetchWithPagination,
	OutputFormat,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { makeClient } from "../../utils/sdk";
import { createSpinner } from "../../utils/spinner";
import { printData, printError } from "../../utils/verbosity";

/**
 * Registers the 'repos' command and subcommands for managing code repositories.
 *
 * This command provides comprehensive repository management functionality including
 * listing repositories, creating new repository integrations, updating configurations,
 * listing builds for a repository, and deleting repositories.
 *
 * Available subcommands:
 * - list: List all repositories
 * - get: Get details of a specific repository
 * - connect: Create a new repository integration
 * - update: Update an existing repository's configuration
 * - builds: List builds for a repository
 * - disconnect: Disconnect a repository
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli repos list
 * signaloid-cli repos get --repo-id repo-123
 * signaloid-cli repos connect --url https://github.com/user/repo
 * signaloid-cli repos update --repo-id repo-123 --name UpdatedName
 * signaloid-cli repos builds --repo-id repo-123
 * signaloid-cli repos disconnect --repo-id repo-123
 * ```
 */
export default function repos(program: Command) {
	const cmd = program.command("repos").description("Connect and manage code repositories");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	// signaloid-cli repos list
	cmd.command("list")
		.description("List repositories")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("repos");
				return;
			}

			const spinner = createSpinner("Fetching repositories...");
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				const result = await fetchWithPagination<any>(
					async (startKey) => {
						const res = await client.repositories.list(startKey);
						return res as any;
					},
					"Repositories",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					const output: any = { Repositories: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					printData(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printData(createCustomTable("repos", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list repositories");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos get --repo-id <repoId>
	cmd.command("get")
		.description("Get a repository by ID")
		.requiredOption("--repo-id <id>", "Repo ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = createSpinner("Fetching repository...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.repositories.getOne(repoId); // SDK method
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Repository: ${repoId}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get repository");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos lookup --url <gitUrl> --branch <name>
	cmd.command("lookup")
		.description("Check if a repository is already connected by URL and branch")
		.requiredOption("--url <gitUrl>", "Remote repository URL")
		.requiredOption("--branch <name>", "Branch name")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Looking up repository...");
			try {
				const client = makeClient(await loadConfig());
				const result = await client.repositories.lookup({
					RemoteURL: String(opts.url),
					Branch: String(opts.branch),
				});
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify({ RepositoryID: result?.RepositoryID ?? null }, null, 2));
				} else {
					if (result === null) {
						printData("Not found");
					} else {
						printData(createCustomTable("repos", [{ RepositoryID: result.RepositoryID }], ["id"]));
					}
				}
			} catch (e: any) {
				spinner.fail("Failed to look up repository");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos connect --url <gitUrl> [--commit <sha>] [--branch <name>] [--dir <path>] [--args "<args>"] [--core-id <coreId>] [--trace-variables <json>] [--data-sources <json>]
	// Note: payload fields use capitalized keys per SDK types (RepositoryRequest)
	cmd.command("connect")
		.description("Connect a repository")
		.requiredOption("--url <gitUrl>", "Remote Git URL (RemoteURL)")
		.option("--commit <sha>", "Commit (Commit)")
		.option("--branch <name>", "Branch (Branch)")
		.option("--dir <path>", "Build directory (BuildDirectory)")
		.option("--args <args>", "Default arguments (Arguments)")
		.option("--core-id <coreId>", "Core ID")
		.option(
			"--trace-variables <json>",
			'JSON array of TraceVariableRequest objects, e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"/data","Object":"DataSource","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.action(async (opts) => {
			const spinner = createSpinner("Connecting repository...");
			try {
				// Validate URL: API only accepts HTTPS Git URLs (no SSH)
				const url = String(opts.url);
				const isScpSshForm = /^[\w.-]+@[\w.-]+:/.test(url);
				let parsedUrl: URL | null = null;
				try {
					parsedUrl = new URL(url);
				} catch {
					// not parseable — handled below
				}

				if (isScpSshForm || parsedUrl?.protocol === "ssh:") {
					spinner.fail("SSH Git URLs are not supported");
					printError(
						"Please use an HTTPS Git URL (e.g., https://github.com/user/repo). SSH URLs are not accepted by the API.",
					);
					process.exit(2);
				}

				if (!parsedUrl || parsedUrl.protocol !== "https:") {
					spinner.fail("Invalid repository URL");
					printError("Please provide an HTTPS Git repository URL (e.g., https://github.com/user/repo).");
					process.exit(2);
				}

				const client = makeClient(await loadConfig());

				const payload: {
					RemoteURL: string;
					Commit: string;
					Branch: string;
					BuildDirectory: string;
					Arguments: string;
					Core?: string;
					TraceVariables?: any[];
					DataSources?: any[];
				} = {
					RemoteURL: url,
					Commit: opts.commit ?? "HEAD",
					Branch: opts.branch ?? "main",
					BuildDirectory: opts.dir ?? "src",
					Arguments: opts.args ?? "",
				};
				if (opts.coreId) payload.Core = String(opts.coreId);
				if (typeof opts.traceVariables === "string") {
					try {
						payload.TraceVariables = JSON.parse(opts.traceVariables);
					} catch (parseErr) {
						spinner.fail("Invalid --trace-variables JSON");
						throw parseErr;
					}
				}
				if (typeof opts.dataSources === "string") {
					try {
						payload.DataSources = JSON.parse(opts.dataSources);
					} catch (parseErr) {
						spinner.fail("Invalid --data-sources JSON");
						throw parseErr;
					}
				}

				const res = await client.repositories.connect(payload as any);
				spinner.succeed("Repository connected");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create repository");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos update --repo-id <repoId> [--remote-url ...] [--commit ...] [--branch ...] [--dir ...] [--args ...] [--core-id ...] [--trace-variables ...] [--data-sources ...] [--remove <field>...]
	cmd.command("update")
		.description("Update repository metadata")
		.requiredOption("--repo-id <id>", "Repo ID")
		.option("--remote-url <gitUrl>", "Remote Git URL (RemoteURL)")
		.option("--commit <sha>", "Commit")
		.option("--branch <name>", "Branch")
		.option("--dir <path>", "Build directory")
		.option("--args <args>", "Default arguments")
		.option("--core-id <coreId>", "Core ID")
		.option(
			"--trace-variables <json>",
			'JSON array of TraceVariableRequest objects, e.g. \'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]\'',
		)
		.option(
			"--data-sources <json>",
			'JSON array of DataSource objects, e.g. \'[{"Location":"/data","Object":"DataSource","ResourceID":"drv_...","ResourceType":"Drive"}]\'',
		)
		.option(
			"--remove <field>",
			"Field to clear on the repository (repeatable). Allowed: DataSources, Core, TraceVariables",
			(value: string, previous: string[] = []) => {
				const allowed = ["DataSources", "Core", "TraceVariables"];
				if (!allowed.includes(value)) {
					throw new Error(`--remove must be one of: ${allowed.join(", ")}`);
				}
				return previous.concat([value]);
			},
		)
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = createSpinner("Updating repository...");
			try {
				const client = makeClient(await loadConfig());

				const patch: Record<string, any> = {};
				if (typeof opts.remoteUrl === "string") patch.RemoteURL = opts.remoteUrl;
				if (typeof opts.commit === "string") patch.Commit = opts.commit;
				if (typeof opts.branch === "string") patch.Branch = opts.branch;
				if (typeof opts.dir === "string") patch.BuildDirectory = opts.dir;
				if (typeof opts.args === "string") patch.Arguments = opts.args;
				if (typeof opts.coreId === "string") patch.Core = opts.coreId;
				if (typeof opts.traceVariables === "string") {
					try {
						patch.TraceVariables = JSON.parse(opts.traceVariables);
					} catch (parseErr) {
						spinner.fail("Invalid --trace-variables JSON");
						throw parseErr;
					}
				}
				if (typeof opts.dataSources === "string") {
					try {
						patch.DataSources = JSON.parse(opts.dataSources);
					} catch (parseErr) {
						spinner.fail("Invalid --data-sources JSON");
						throw parseErr;
					}
				}

				const removeFields: string[] = Array.isArray(opts.remove) ? opts.remove : [];
				if (removeFields.length > 0 && Object.keys(patch).length > 0) {
					spinner.fail("Cannot combine --remove with other update fields in the same request");
					process.exit(2);
				}

				const res = await client.repositories.update(repoId, patch as any, {
					remove: removeFields.length > 0 ? removeFields : undefined,
				} as any);
				spinner.succeed("Repository updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update repository");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos disconnect --repo-id <repoId>
	cmd.command("disconnect")
		.description("Disconnect a repository")
		.requiredOption("--repo-id <id>", "Repo ID")
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = createSpinner("Disconnecting repository...");
			try {
				const client = makeClient(await loadConfig());
				await client.repositories.disconnect(repoId);
				spinner.succeed("Repository disconnected");
				printData(JSON.stringify({ RepositoryID: repoId, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to disconnect repository");
				await handleCliError(e);
			}
		});

	// signaloid-cli repos builds --repo-id <repoId> [--from <iso>] [--to <iso>] [--start-key <key>] [--count <n>]
	cmd.command("builds")
		.description("List builds for a repository")
		.requiredOption("--repo-id <id>", "Repo ID")
		.option("--from <iso>", "From timestamp (ISO)")
		.option("--to <iso>", "To timestamp (ISO)")
		.option("--start-key <key>", "Pagination cursor token")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = createSpinner("Fetching repository builds...");
			try {
				const client = makeClient(await loadConfig());
				const result = await fetchWithPagination(
					(startKey) =>
						client.repositories.getBuilds(repoId, {
							from: opts.from,
							to: opts.to,
							startKey: startKey || opts.startKey,
						}),
					"Builds",
					opts.count,
					spinner,
				);
				spinner.succeed();
				const output: any = { Builds: result.items };
				if (result.continuationKey) {
					output.ContinuationKey = result.continuationKey;
				}
				printData(JSON.stringify(output, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list repository builds");
				await handleCliError(e);
			}
		});
}
