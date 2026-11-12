import { Command, InvalidArgumentError, Option } from "commander";
import type { UserPatchRemovableField } from "@signaloid/scce-sdk";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import {
	addPaginationOptions,
	displayResource,
	finishListingSpinner,
	fetchWithPagination,
	limitHelp,
	OutputFormat,
} from "../../utils/output";
import { printData } from "../../utils/verbosity";
import { usageError } from "../../utils/exit-codes";

const REMOVABLE_FIELDS: readonly UserPatchRemovableField[] = ["Editor_Execution_DataSources", "Editor_Execution_Core"];

function removableField(value: string, previous: UserPatchRemovableField[]): UserPatchRemovableField[] {
	if (!REMOVABLE_FIELDS.includes(value as UserPatchRemovableField)) {
		throw new InvalidArgumentError(`must be one of ${REMOVABLE_FIELDS.join(", ")}`);
	}
	return [...previous, value as UserPatchRemovableField];
}

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
 * - update: Update current user's profile (role, industry, preferences)
 * - logs: Fetch activity logs for the current user
 * - logout-all: Invalidate all sessions for a specific user
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli users me
 * signaloid-cli users update --pref Editor_Theme=dark --role engineering
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

	// signaloid-cli users update [--pref Key=Value ...] [--role r] [--industry i] [--payload-file file.json]
	cmd.command("update")
		.description("Update current user profile and preferences")
		.option(
			"--pref <key=value>",
			"Set a preference (repeatable)",
			(v: string, prev: string[]) => (prev ? [...prev, v] : [v]),
			[] as string[],
		)
		.option(
			"--remove <field>",
			`Remove a preference field (repeatable, allowed: ${REMOVABLE_FIELDS.join(", ")})`,
			removableField,
			[] as UserPatchRemovableField[],
		)
		.addOption(new Option("--role <role>", "Set your role").conflicts("clearRole"))
		.addOption(new Option("--industry <industry>", "Set your industry").conflicts("clearIndustry"))
		.addOption(new Option("--clear-role", "Clear your role"))
		.addOption(new Option("--clear-industry", "Clear your industry"))
		.option("--payload-file <json>", "JSON file with Preferences object")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const profile: Record<string, unknown> = {};
			if (opts.role !== undefined || opts.clearRole) {
				profile.Role = opts.clearRole ? null : opts.role;
			}
			if (opts.industry !== undefined || opts.clearIndustry) {
				profile.Industry = opts.clearIndustry ? null : opts.industry;
			}
			const prefPairs: [string, string][] = [];
			for (const kv of opts.pref as string[]) {
				const idx = kv.indexOf("=");
				if (idx <= 0) {
					usageError(`Invalid --pref "${kv}": expected key=value.`);
					return;
				}
				prefPairs.push([kv.slice(0, idx), kv.slice(idx + 1)]);
			}
			const hasPrefInput = Boolean(opts.payloadFile) || (opts.pref as string[]).length > 0;
			const removeFields = opts.remove as UserPatchRemovableField[];
			if (!hasPrefInput && Object.keys(profile).length === 0 && removeFields.length === 0) {
				usageError(
					"At least one option must be provided: --pref, --remove, --role, --industry, --clear-role, --clear-industry or --payload-file.",
				);
				return;
			}

			const spinner = createSpinner("Updating user...");
			try {
				// Read the payload file first, so that a bad one fails before any request.
				const extra = opts.payloadFile ? (await loadJsonIfPath(opts.payloadFile)) || {} : undefined;

				const client = makeClient(await loadConfig());

				const me = await client.users.me();
				const userID = me.UserID;

				// The API sets each given preference key and leaves the others as they are, so
				// only the keys given here are sent. Resending the stored ones would fail with 400
				// for accounts with legacy keys (such as EditorTheme), which the API no longer accepts.
				const prefs: Record<string, unknown> = {};

				// Merge the payload file, unwrapping its Preferences key if present. UpdatedAt is
				// dropped, so that the Preferences of `users me` can be passed back as they are.
				if (extra) {
					const { UpdatedAt, ...extraPrefs } = (extra.Preferences ?? extra) as Record<string, unknown>;
					Object.assign(prefs, extraPrefs);
				}

				// Merge inline --pref flags
				Object.assign(prefs, Object.fromEntries(prefPairs));

				const patch = hasPrefInput ? { Preferences: prefs, ...profile } : profile;
				const res =
					removeFields.length > 0
						? await client.users.update(userID, patch as any, { remove: removeFields })
						: await client.users.update(userID, patch as any);
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

	// signaloid-cli users logs [--from <iso>] [--to <iso>] [--count <n>] [--limit <n>] [--cursor <cursor>]
	// Fetches logs for the CURRENT user (use logout-all for a specific user by ID), newest first.
	addPaginationOptions(cmd.command("logs"), {
		limitHelp: limitHelp(100, 10_000),
		startKey: false,
	})
		.description("Fetch activity logs for the current user")
		.option("--from <iso>", "From timestamp (ISO)")
		.option("--to <iso>", "To timestamp (ISO)")
		// Kept so scripts that pass it still work. Logs are always shown as JSON.
		.addOption(new Option("--format <type>").hideHelp())
		.action(async (opts) => {
			const spinner = createSpinner("Fetching logs...");
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();

				const startTime = toEpochMs(opts.from);
				const endTime = toEpochMs(opts.to);
				const result = await fetchWithPagination(
					(query) => client.users.getLogs(me.UserID, { ...query, startTime, endTime }),
					"logs",
					opts,
				);
				finishListingSpinner(spinner, result);

				// The fields besides the entries keep their names from the API: `totalResults`
				// counts the entries shown.
				const output = {
					logs: result.items,
					...result.next,
					queryTimeRange: result.lastPage?.queryTimeRange,
					totalResults: result.items.length,
				};
				printData(JSON.stringify(output, null, 2));
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
