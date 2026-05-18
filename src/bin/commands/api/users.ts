import { Command, InvalidArgumentError } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { OutputFormat, displayResource } from "../../utils/output";
import { printData } from "../../utils/verbosity";

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
	const cmd = program.command("users").description("View and manage user account information");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	// signaloid-cli users me
	cmd.command("me")
		.description("View current authenticated user information")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching user...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.users.me();
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Current User");
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch user");
				await handleCliError(e);
			}
		});

	// signaloid-cli users customization
	cmd.command("customization")
		.description("View user customization (organizations, atomic networks)")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching customization...");
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();
				const res = await client.users.getCustomization(me.UserID);
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "User Customization");
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch customization");
				await handleCliError(e);
			}
		});

	// signaloid-cli users delete --user-id <id>
	cmd.command("delete")
		.description("Delete a user account")
		.requiredOption("--user-id <id>", "User ID to delete")
		.action(async (opts) => {
			const spinner = createSpinner("Deleting user...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.users.delete(String(opts.userId));
				spinner.succeed("User deleted");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete user");
				await handleCliError(e);
			}
		});

	// signaloid-cli users update [--pref Key=Value ...] [--payload-file file.json]
	// API only supports updating Preferences
	cmd.command("update")
		.description("Update current user preferences")
		.option("--pref <key=value>", "Set a preference (repeatable)", (v: string, prev: string[]) => (prev ? [...prev, v] : [v]), [] as string[])
		.option("--remove <field>", "Remove a preference field (repeatable, allowed: Editor_Execution_DataSources, Editor_Execution_Core)", (v: string, prev: string[]) => (prev ? [...prev, v] : [v]), [] as string[])
		.option("--payload-file <json>", "JSON file with Preferences object")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Updating user...");
			try {
				const client = makeClient(await loadConfig());

				const me = await client.users.me();
				const userID = me.UserID;

				// Start with current preferences (strip UpdatedAt)
				const { UpdatedAt, ...currentPrefs } = (me.Preferences || {}) as Record<string, unknown>;
				const prefs: Record<string, string> = { ...currentPrefs } as Record<string, string>;

				// Merge from payload file
				if (opts.payloadFile) {
					const extra = (await loadJsonIfPath(opts.payloadFile)) || {};
					Object.assign(prefs, extra);
				}

				// Merge inline --pref flags
				for (const kv of (opts.pref as string[])) {
					const idx = kv.indexOf("=");
					if (idx > 0) {
						prefs[kv.slice(0, idx)] = kv.slice(idx + 1);
					}
				}

				const patch = { Preferences: prefs };
				const removeFields = (opts.remove as string[]) || [];
				const res = await client.users.update(userID, patch as any, removeFields.length > 0 ? { remove: removeFields } : undefined);
				spinner.succeed("User updated");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Updated User");
				}
			} catch (e: any) {
				spinner.fail("Failed to update user");
				await handleCliError(e);
			}
		});

	// signaloid-cli users logs [--from <iso>] [--to <iso>] [--limit n]
	// Fetches logs for the CURRENT user (use logout-all for a specific user by ID).
	cmd.command("logs")
		.description("Fetch activity logs for the current user")
		.option("--from <iso>", "From timestamp (ISO)")
		.option("--to <iso>", "To timestamp (ISO)")
		.option("--count <n>", "Number of logs to fetch", (v) => {
			const n = parseInt(v, 10);
			if (Number.isNaN(n) || n <= 0) {
				throw new InvalidArgumentError("must be a positive integer");
			}
			return n;
		})
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching logs...");
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();

				const startTime = toEpochMs(opts.from);
				const endTime = toEpochMs(opts.to);
				const limit = typeof opts.count === "number" ? opts.count : undefined;

				const res = await client.users.getLogs(me.UserID, {
					startTime,
					endTime,
					limit,
				});
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					// Logs are best displayed as JSON, but respect the flag
					printData(JSON.stringify(res, null, 2));
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch logs");
				await handleCliError(e);
			}
		});

	// signaloid-cli users logout-all <userId>
	cmd.command("logout-all")
		.description("Invalidate all sessions for a user")
		.requiredOption("--user-id <id>", "User ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Logging out all sessions...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.users.logoutAllSessions(String(opts.userId));
				spinner.succeed("Logout-all requested");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Logout Result");
				}
			} catch (e: any) {
				spinner.fail("Failed to logout-all");
				await handleCliError(e);
			}
		});
}
