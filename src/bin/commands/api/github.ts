import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData, printError } from "../../utils/verbosity";

async function resolveUserId(explicitUserId?: string) {
	if (explicitUserId) return explicitUserId;
	const client = makeClient(await loadConfig());
	const me = await client.users.me();
	return me.id || me.userID || me.UserID; // tolerate casing variants
}

/**
 * Registers the 'github' command and subcommands for managing GitHub integration.
 *
 * This command provides functionality for connecting and managing GitHub account
 * integration with Signaloid, enabling repository access and collaboration features.
 *
 * Available subcommands:
 * - status: Display current GitHub integration status
 * - connect: Create or update GitHub integration with username and token
 * - disconnect: Remove GitHub integration
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli github status
 * signaloid-cli github connect --username myusername --token ghp_abc123
 * signaloid-cli github disconnect
 * ```
 */
export default function github(program: Command) {
	const cmd = program.command("github").description("Connect and manage GitHub integration");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("status")
		.description("Show current GitHub integration (for me or a given user)")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching GitHub integration...");
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.getIntegration(userID);
				spinner.succeed();
				const { GithubUsername, ...rest } = res as any;
				const output = GithubUsername !== undefined ? { Username: GithubUsername, ...rest } : res;
				printData(JSON.stringify(output, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch integration");
				await handleCliError(e);
			}
		});

	cmd.command("connect")
		.description("Create or update GitHub integration via OAuth code")
		.requiredOption("--token <code>", "GitHub OAuth authorization code")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = createSpinner("Connecting GitHub...");
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.createOrUpdateIntegration(userID, {
					GithubAuthCode: opts.token,
				});
				spinner.succeed("GitHub connected/updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to connect/update GitHub");
				await handleCliError(e);
			}
		});

	cmd.command("disconnect")
		.description("Delete GitHub integration")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = createSpinner("Disconnecting GitHub...");
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.deleteIntegration(userID);
				spinner.succeed("GitHub disconnected");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to disconnect GitHub");
				await handleCliError(e);
			}
		});

	cmd.command("proxy")
		.description("Proxy a GitHub API request via Signaloid")
		.requiredOption("--path <path>", "GitHub API path, e.g. 'user/repos' or 'repos/owner/name/branches'")
		.option("--method <m>", "HTTP method (GET|POST|PUT|DELETE)", "GET")
		.action(async (opts) => {
			const pathArg = String(opts.path);
			const spinner = createSpinner(`Proxying ${opts.method} ${pathArg} ...`);
			try {
				const client = makeClient(await loadConfig());
				const method = String(opts.method || "GET").toUpperCase() as "GET" | "POST" | "PUT" | "DELETE";
				const res = await client.github.proxyRequest(pathArg, method);
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Proxy request failed");
				await handleCliError(e);
			}
		});

	cmd.command("repos")
		.description("List GitHub repos (via proxy: GET user/repos)")
		.action(async () => {
			const spinner = createSpinner("Fetching GitHub repos...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.github.proxyRequest("user/repos", "GET");
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list repos");
				await handleCliError(e);
			}
		});

	cmd.command("branches")
		.description("List branches for a repo (via proxy)")
		.option("--owner <owner>", "Repo owner (required unless --repo-id is used)")
		.option("--repo <name>", "Repo name (required unless --repo-id is used)")
		.option("--repo-id <id>", "Signaloid repository ID (resolves owner/repo automatically)")
		.action(async (opts) => {
			try {
				const client = makeClient(await loadConfig());
				let owner = opts.owner;
				let repo = opts.repo;

				if (opts.repoId) {
					const spinner = createSpinner("Resolving repository...");
					const repoData = await client.repositories.getOne(String(opts.repoId));
					const remoteURL = (repoData as any).RemoteURL || (repoData as any).remoteURL;
					if (!remoteURL) {
						spinner.fail("Repository has no remote URL");
						process.exit(1);
					}
					const match = remoteURL.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
					if (!match) {
						spinner.fail(`Cannot parse owner/repo from remote URL: ${remoteURL}`);
						process.exit(1);
					}
					owner = match[1];
					repo = match[2];
					spinner.succeed(`Resolved to ${owner}/${repo}`);
				} else if (!owner || !repo) {
					printError("Either --repo-id or both --owner and --repo are required.");
					process.exit(1);
				}

				const spinner = createSpinner("Fetching branches...");
				const path = `repos/${owner}/${repo}/branches`;
				const res = await client.github.proxyRequest(path, "GET");
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				createSpinner("").fail("Failed to list branches");
				await handleCliError(e);
			}
		});
}
