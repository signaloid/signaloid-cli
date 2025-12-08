import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { loadConfig } from "../../utils/config";
import {
	OutputFormat,
	createCustomTable,
	fetchWithPagination,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { makeClient } from "../../utils/sdk";
import { validateApiKey } from "../../utils/validate-api-key";
import { config } from "../../../config/env.config";
import { parseDuration } from "../../utils/time";
import { handleCliError } from "../../utils/error-handler";

/**
 * Registers the 'keys' command and subcommands for managing API keys.
 *
 * This command provides comprehensive API key management functionality including
 * listing existing keys, creating new keys with optional expiration dates,
 * and revoking keys that are no longer needed.
 *
 * Available subcommands:
 * - list: List all API keys
 * - create: Create a new API key with optional expiration
 * - revoke: Revoke an existing API key
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli keys list
 * signaloid-cli keys create --name "My API Key" --valid-until 2025-12-31T23:59:59Z
 * signaloid-cli keys revoke --key-id key-123
 * ```
 */
export default function keys(program: Command) {
	const cmd = program.command("keys").description("Manage API keys");

	// signaloid-cli keys list
	cmd.command("list")
		.description("List API keys")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: json|table", "table")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("keys");
				return;
			}

			const spinner = ora("Fetching API keys...").start();
			try {
				const client = makeClient(await loadConfig());
				const targetCount = opts.count;

				// Note: keys.list() doesn't support pagination parameters via SDK
				// So we'll make a simple wrapper that ignores the startKey
				const result = await fetchWithPagination<any>(
					async (_startKey) => {
						const res = await client.keys.list();
						return res as any;
					},
					"Keys",
					targetCount,
					spinner,
				);

				spinner.succeed();

				const format = (opts.format || "table") as OutputFormat;
				if (format === "json") {
					const output: any = { Keys: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					console.log(JSON.stringify(output, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					console.log(createCustomTable("keys", result.items, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list keys");
				await handleCliError(e, "Listing API keys");
			}
		});

	// signaloid-cli keys create --name MyKey [--valid-until 2025-12-31T23:59:59Z]
	cmd.command("create")
		.description("Create a new API key")
		.requiredOption("--name <name>", "Key name")
		.option("--valid-until <iso>", "Expiration date (ISO 8601). Default: no expiry")
		.option("--valid-for <duration>", "Duration before expiry (e.g. 7d, 24h, 30m)")
		.action(async (opts) => {
			const spinner = ora("Creating API key...").start();
			try {
				const client = makeClient(await loadConfig());

				if (opts.validUntil && opts.validFor) {
					throw new Error("Use either --valid-until or --valid-for, not both.");
				}

				let validUntil: number | null = null;

				// --valid-until
				if (opts.validUntil) {
					const date = new Date(opts.validUntil);
					if (isNaN(date.getTime())) {
						throw new Error(`Invalid date format for --valid-until: ${opts.validUntil}`);
					}
					validUntil = date.getTime();
				}

				// --valid-for
				if (opts.validFor) {
					const now = Date.now();
					const durationMs = parseDuration(opts.validFor);
					validUntil = now + durationMs;
				}

				const payload = {
					Name: opts.name,
					ValidUntil: validUntil,
				};

				const res = await client.keys.create(payload);
				spinner.succeed("API key created");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create key");
				await handleCliError(e);
			}
		});

	// signaloid-cli keys delete --key-id <keyId>
	cmd.command("delete")
		.description("Delete an API key by ID")
		.requiredOption("--key-id <id>", "Key ID")
		.action(async (opts) => {
			const keyId = String(opts.keyId);
			const spinner = ora("Deleting API key...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.keys.delete(keyId);
				spinner.succeed("API key deleted");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete key");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	cmd.command("validate")
		.description("Validate a Signaloid API key")
		.requiredOption("--api-key <KEY>", "API key to validate")
		.action(async (opts) => {
			const spinner = ora("Validating API key...").start();
			try {
				const isValid = await validateApiKey(String(opts.apiKey));
				if (!isValid) {
					spinner.fail("Invalid API key.");
					console.log(
						chalk.red(
							`You can create a new API key using: ${chalk.cyan("signaloid-cli keys create --name <MyKey>")}\n` +
								`or directly from your account settings at: ${chalk.cyan(`${config.SIGNALOID_URL}/settings/api`)}`,
						),
					);
					process.exitCode = 1;
				} else {
					spinner.succeed("API key is valid.");
				}
			} catch (e: any) {
				spinner.fail("Failed to validate API key");
				await handleCliError(e);
			}
		});
}
