import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";

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
	const cmd = program.command("github").description("GitHub integration");

	cmd.command("status")
		.description("Show current GitHub integration (for me or a given user)")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = ora("Fetching GitHub integration...").start();
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.getIntegration(userID);
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch integration");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("connect")
		.description("Create or update GitHub integration")
		.requiredOption("--username <ghUser>", "GitHub username")
		.requiredOption("--token <pat>", "GitHub Personal Access Token")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = ora("Connecting GitHub...").start();
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.createOrUpdateIntegration(userID, {
					GithubUsername: opts.username,
					GithubToken: opts.token,
				});
				spinner.succeed("GitHub connected/updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to connect/update GitHub");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("disconnect")
		.description("Delete GitHub integration")
		.option("--user-id <id>", "User ID (defaults to current user)")
		.action(async (opts) => {
			const spinner = ora("Disconnecting GitHub...").start();
			try {
				const userID = await resolveUserId(opts.userId);
				const client = makeClient(await loadConfig());
				const res = await client.github.deleteIntegration(userID);
				spinner.succeed("GitHub disconnected");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to disconnect GitHub");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("proxy")
		.description("Proxy a GitHub API request via Signaloid")
		.requiredOption("--path <path>", "GitHub API path, e.g. 'user/repos' or 'repos/owner/name/branches'")
		.option("--method <m>", "HTTP method (GET|POST|PUT|DELETE)", "GET")
		.action(async (opts) => {
			const pathArg = String(opts.path);
			const spinner = ora(`Proxying ${opts.method} ${pathArg} ...`).start();
			try {
				const client = makeClient(await loadConfig());
				const method = String(opts.method || "GET").toUpperCase() as "GET" | "POST" | "PUT" | "DELETE";
				const res = await client.github.proxyRequest(pathArg, method);
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Proxy request failed");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("repos")
		.description("List GitHub repos (via proxy: GET user/repos)")
		.action(async () => {
			const spinner = ora("Fetching GitHub repos...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.github.proxyRequest("user/repos", "GET");
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list repos");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("branches")
		.description("List branches for a repo (via proxy)")
		.requiredOption("--owner <owner>", "Repo owner")
		.requiredOption("--repo <name>", "Repo name")
		.action(async (opts) => {
			const spinner = ora("Fetching branches...").start();
			try {
				const client = makeClient(await loadConfig());
				const path = `repos/${opts.owner}/${opts.repo}/branches`;
				const res = await client.github.proxyRequest(path, "GET");
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list branches");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
