import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
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
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData, printError, printInfo } from "../../utils/verbosity";
import inquirer from "inquirer";

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
	const cmd = program.command("keys").description("Create and manage API keys for authentication");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	// signaloid-cli keys list
	cmd.command("list")
		.description("List API keys")
		.option("--count <n>", "Number of items to fetch using pagination", (v) => parseInt(v, 10))
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			// Show column help if requested
			if (opts.columns === "help") {
				showAvailableColumns("keys");
				return;
			}

			const spinner = createSpinner("Fetching API keys...");
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

				const selectedColumns = parseColumns(opts.columns);
				const format = (selectedColumns ? "table" : opts.format || "json") as OutputFormat;
				if (format === "json") {
					const output: any = { Keys: result.items };
					if (result.continuationKey) {
						output.ContinuationKey = result.continuationKey;
					}
					printData(JSON.stringify(output, null, 2));
				} else {
					printData(createCustomTable("keys", result.items, selectedColumns));
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
			const spinner = createSpinner("Creating API key...");
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
					validUntil = Math.floor(date.getTime() / 1000);
				}

				// --valid-for
				if (opts.validFor) {
					const now = Date.now();
					const durationMs = parseDuration(opts.validFor);
					validUntil = Math.floor((now + durationMs) / 1000);
				}

				const payload = {
					Name: opts.name,
					ValidUntil: validUntil,
				};

				const res = await client.keys.create(payload);
				spinner.succeed("API key created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create key");
				await handleCliError(e);
			}
		});

	// signaloid-cli keys delete [--key-id <keyId> | --api-key <apiKey>]
	cmd.command("delete")
		.alias("revoke")
		.description("Delete (revoke) an API key by ID")
		.option("--key-id <id>", "Key ID")
		.option("--api-key <key>", "API key")
		.action(async (opts) => {
			if (opts.keyId && opts.apiKey) {
				printError("Use either --key-id or --api-key, not both.");
				process.exitCode = 1;
				return;
			}

			const client = makeClient(await loadConfig());
			let keyId: string;

			if (opts.keyId) {
				keyId = String(opts.keyId);
			} else if (opts.apiKey) {
				const raw = String(opts.apiKey);
				keyId = raw.startsWith("scce_") ? raw.slice("scce_".length) : raw;
			} else {
				// Interactive flow: fetch all keys and let the user pick one.
				const fetchSpinner = createSpinner("Fetching API keys...");
				let keys: any[] = [];
				try {
					const res = await client.keys.list();
					fetchSpinner.succeed();
					keys = (res as any).Keys ?? [];
				} catch (e: any) {
					fetchSpinner.fail("Failed to fetch API keys");
					await handleCliError(e, "Listing API keys");
					return;
				}

				if (keys.length === 0) {
					printInfo("No API keys found.");
					return;
				}

				function formatDate(value: unknown): string {
					if (!value) return "—";
					const ts = typeof value === "number" ? value * 1000 : value;
					const d = new Date(ts as string | number);
					return isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
				}

				function maskId(id: string): string {
					return id.length > 8 ? `${id.slice(0, 8)}…` : id;
				}

				const nameWidth = Math.max(...keys.map((k: any) => (k.Name || "(unnamed)").length), 8);

				function formatKeyChoice(key: any): string {
					const name = (key.Name || "(unnamed)").padEnd(nameWidth);
					const id = maskId(key.KeyID || "unknown").padEnd(9);
					const created = formatDate(key.CreatedAt);
					const expires = key.ValidUntil ? `expires ${formatDate(key.ValidUntil)}` : "no expiry";
					return `${chalk.bold(name)}  ${chalk.dim(id)}  created ${created}  ${expires}`;
				}

				const CANCEL = "__cancel__";
				let selectedKeyId: string;
				try {
					const result = await inquirer.prompt<{ selectedKeyId: string }>([
						{
							type: "list",
							name: "selectedKeyId",
							message: "Select an API key to delete:",
							loop: false,
							choices: [
								...keys.map((key: any) => ({
									name: formatKeyChoice(key),
									value: key.KeyID,
								})),
								new inquirer.Separator(),
								{ name: "Cancel", value: CANCEL },
							],
						},
					]);
					selectedKeyId = result.selectedKeyId;
				} catch (e: any) {
					if (e?.name === "ExitPromptError") {
						printInfo("\nCancelled.");
						return;
					}
					throw e;
				}

				if (selectedKeyId === CANCEL) {
					printInfo("Cancelled.");
					return;
				}

				keyId = selectedKeyId;
			}

			const spinner = createSpinner("Deleting API key...");
			try {
				await client.keys.delete(keyId);
				spinner.succeed("API key deleted");
			} catch (e: any) {
				spinner.fail("Failed to delete key");
				await handleCliError(e);
			}
		});

	cmd.command("validate")
		.description("Validate a Signaloid API key")
		.requiredOption("--api-key <KEY>", "API key to validate")
		.action(async (opts) => {
			const spinner = createSpinner("Validating API key...");
			try {
				const isValid = await validateApiKey(String(opts.apiKey));
				if (!isValid) {
					spinner.fail("Invalid API key.");
					printError(
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
