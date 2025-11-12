import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";

function toEpochMs(iso?: string): number | undefined {
	if (!iso) return undefined;
	const d = new Date(iso);
	if (isNaN(d.getTime())) {
		throw new Error(`Invalid ISO datetime: ${iso}`);
	}
	return d.getTime();
}

/**
 * Registers the 'users' command and subcommands for managing user accounts.
 *
 * This command provides comprehensive user account management functionality
 * including viewing current user information, updating user profiles,
 * fetching activity logs, and managing user sessions.
 *
 * Available subcommands:
 * - me: Get current authenticated user information
 * - update: Update current user's profile (name, email, preferences)
 * - logs: Fetch activity logs for the current user
 * - logout-all: Invalidate all sessions for a specific user
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli users me
 * signaloid-cli users update --name "John Doe" --email john@example.com
 * signaloid-cli users logs --from 2025-01-01T00:00:00Z --to 2025-12-31T23:59:59Z
 * signaloid-cli users logout-all --user-id user-123
 * ```
 */
export default function users(program: Command) {
	const cmd = program.command("users").description("User info & actions");

	// signaloid-cli users me
	cmd.command("me")
		.description("Current user")
		.action(async () => {
			const spinner = ora("Fetching user...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.users.me();
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch user");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli users update [--name ...] [--email ...] [--payload-file file.json]
	// Payload keys follow SDK types (UserPatchRequest): Username, Email, Preferences?
	cmd.command("update")
		.description("Update current user")
		.option("--name <str>", "Display name (Username)")
		.option("--email <email>", "Email")
		.option("--payload-file <json>", "Additional fields to merge into the patch")
		.action(async (opts) => {
			const spinner = ora("Updating user...").start();
			try {
				const client = makeClient(await loadConfig());

				// Get current user id
				const me = await client.users.me();
				const userID = me.UserID;

				// Build patch with capitalized keys as per SDK
				const patch: Record<string, any> = {};
				if (typeof opts.name === "string") patch.Username = opts.name;
				if (typeof opts.email === "string") patch.Email = opts.email;

				if (opts.payloadFile) {
					const extra = (await loadJsonIfPath(opts.payloadFile)) || {};
					Object.assign(patch, extra);
				}

				const res = await client.users.update(userID, patch as any);
				spinner.succeed("User updated");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to update user");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli users logs [--from <iso>] [--to <iso>] [--limit n]
	// Fetches logs for the CURRENT user (use logout-all for a specific user by ID).
	cmd.command("logs")
		.description("Fetch logs for the current user")
		.option("--from <iso>", "From timestamp (ISO)")
		.option("--to <iso>", "To timestamp (ISO)")
		.option("--limit <n>", "Limit", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const spinner = ora("Fetching logs...").start();
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();

				const startTime = toEpochMs(opts.from);
				const endTime = toEpochMs(opts.to);
				const limit = typeof opts.limit === "number" ? opts.limit : undefined;

				const res = await client.users.getLogs(me.UserID, {
					startTime,
					endTime,
					limit,
				});
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch logs");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli users logout-all <userId>
	cmd.command("logout-all")
		.description("Invalidate all sessions for a user (if permitted)")
		.requiredOption("--user-id <id>", "user ID")
		.action(async (opts) => {
			const spinner = ora("Logging out all sessions...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.users.logoutAllSessions(String(opts.userId));
				spinner.succeed("Logout-all requested");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to logout-all");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
