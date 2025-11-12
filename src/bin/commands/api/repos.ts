import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { validateURL, validateNonEmptyString } from "../../utils/validation";
import {
	formatReposTable,
	displayResource,
	OutputFormat,
	createCustomTable,
	parseColumns,
	showAvailableColumns,
	fetchWithPagination,
} from "../../utils/output";

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
 * - delete: Delete a repository
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
 * signaloid-cli repos delete --repo-id repo-123
 * ```
 */
export default function repos(program: Command) {
	const cmd = program.command("repos").description("Manage repositories");

	// signaloid-cli repos list
	cmd.command("list")
		.description("List repositories")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("repos");
				return;
			}

			const spinner = ora("Fetching repositories...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				// Note: repositories.list() doesn't support pagination parameters via SDK
				// So we'll make a simple wrapper that ignores the startKey
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

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Repositories: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("repos", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list repositories");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli repos get --repo-id <repoId>
	cmd.command("get")
		.description("Get a repository by ID")
		.requiredOption("--repo-id <id>", "Repo ID")
		.option("--format <type>", "Output format: json|table", "table")
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = ora("Fetching repository...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.repositories.getOne(repoId); // SDK method
				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					console.log(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, `Repository: ${repoId}`);
				}
			} catch (e: any) {
				spinner.fail("Failed to get repository");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli repos connect --url <gitUrl> [--commit <sha>] [--branch <name>] [--dir <path>] [--args "<args>"] [--core <coreId>]
	// Note: payload fields use capitalized keys per SDK types (RepositoryRequest)
	cmd.command("connect")
		.description("Connect a repository")
		.requiredOption("--url <gitUrl>", "Remote Git URL (RemoteURL)")
		.option("--commit <sha>", "Commit (Commit)")
		.option("--branch <name>", "Branch (Branch)")
		.option("--dir <path>", "Build directory (BuildDirectory)")
		.option("--args <args>", "Default arguments (Arguments)")
		.option("--core-id <coreId>", "Core ID")
		.action(async (opts) => {
			const spinner = ora("Connecting repository...").start();
			try {
				// Validate URL
				const url = String(opts.url);
				if (!validateURL(url)) {
					spinner.fail("Invalid repository URL");
					console.error("Please provide a valid Git repository URL (e.g., https://github.com/user/repo)");
					process.exit(1);
				}

				const client = makeClient(await loadConfig());

				const payload: {
					RemoteURL: string;
					Commit: string;
					Branch: string;
					BuildDirectory: string;
					Arguments: string;
					Core?: string;
				} = {
					RemoteURL: url,
					Commit: opts.commit ?? "HEAD",
					Branch: opts.branch ?? "main",
					BuildDirectory: opts.dir ?? "src",
					Arguments: opts.args ?? "",
				};
				if (opts.coreId) payload.Core = String(opts.coreId);

				const res = await client.repositories.connect(payload as any);
				spinner.succeed("Repository connected");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create repository");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli repos update --repo-id <repoId> [--commit ...] [--branch ...] [--dir ...] [--args ...] [--core ...]
	cmd.command("update")
		.description("Update repository metadata")
		.requiredOption("--repo-id <id>", "Repo ID")
		.option("--commit <sha>", "Commit")
		.option("--branch <name>", "Branch")
		.option("--dir <path>", "Build directory")
		.option("--args <args>", "Default arguments")
		.option("--core-id <coreId>", "Core ID")
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = ora("Updating repository...").start();
			try {
				const client = makeClient(await loadConfig());

				const patch: Record<string, any> = {};
				if (typeof opts.commit === "string") patch.Commit = opts.commit;
				if (typeof opts.branch === "string") patch.Branch = opts.branch;
				if (typeof opts.dir === "string") patch.BuildDirectory = opts.dir;
				if (typeof opts.args === "string") patch.Arguments = opts.args;
				if (typeof opts.coreId === "string") patch.Core = opts.coreId;

				const res = await client.repositories.update(repoId, patch as any);
				spinner.succeed("Repository updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update repository");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli repos disconnect --repo-id <repoId>
	cmd.command("disconnect")
		.description("Disconnect a repository")
		.requiredOption("--repo-id <id>", "Repo ID")
		.action(async (opts) => {
			const repoId = String(opts.repoId);
			const spinner = ora("Disconnecting repository...").start();
			try {
				const client = makeClient(await loadConfig());
				await client.repositories.delete(repoId);
				spinner.succeed("Repository disconnected");
				console.log(JSON.stringify({ RepositoryID: repoId, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to disconnect repository");
				console.error(e?.message || String(e));
				process.exit(1);
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
			const spinner = ora("Fetching repository builds...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.repositories.getBuilds(repoId, {
					from: opts.from,
					to: opts.to,
					startKey: opts.startKey,
				});
				if (opts.count && Array.isArray(res.Builds)) {
					res.Builds = res.Builds.slice(0, opts.count);
				}
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list repository builds");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
