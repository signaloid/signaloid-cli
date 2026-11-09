import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import chalk from "chalk";
import { loadConfig } from "../../utils/config";
import {
	addPaginationOptions,
	createCustomTable,
	finishListingSpinner,
	fetchWithPagination,
	limitHelp,
	OutputFormat,
	printListing,
	printListingTable,
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
import { EXIT_CODES, usageError } from "../../utils/exit-codes";
import inquirer from "inquirer";

/**
 * Extracts the KeyID from a full API key.
 *
 * Keys look like scce_<KeyID: 32 hex><payload: 32 hex>_<CRC32 checksum in hex>,
 * and the KeyID is the publishable part. Returns undefined for a malformed key.
 */
export function keyIdFromApiKey(apiKey: string): string | undefined {
	const match = /^scce_([0-9a-f]{32})[0-9a-f]{32}_[0-9a-f]{1,8}$/i.exec(apiKey.trim());
	return match ? match[1] : undefined;
}

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
	addPaginationOptions(cmd.command("list"), {
		limitHelp: limitHelp(100),
		startKey: false,
	})
		.description("List API keys")
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

				const result = await fetchWithPagination((query) => client.keys.list(query), "Keys", opts);

				finishListingSpinner(spinner, result);

				const selectedColumns = parseColumns(opts.columns);
				const format = (selectedColumns ? "table" : opts.format || "json") as OutputFormat;
				if (format === "json") {
					printListing("Keys", result);
				} else {
					printListingTable("keys", result, selectedColumns);
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

				// The keys endpoint expects ValidUntil in epoch seconds (builds and tasks use milliseconds).
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
				return usageError("Use either --key-id or --api-key, not both.");
			}

			let keyId: string | undefined;
			if (opts.keyId) {
				keyId = String(opts.keyId);
			} else if (opts.apiKey) {
				keyId = keyIdFromApiKey(String(opts.apiKey));
				if (!keyId) {
					return usageError(
						"Invalid API key format. Expected scce_<KeyID><payload>_<checksum>; use --key-id <id> instead.",
					);
				}
			}

			let client: ReturnType<typeof makeClient>;
			try {
				client = makeClient(await loadConfig());
			} catch (e: any) {
				await handleCliError(e);
				return;
			}

			if (!keyId) {
				// Interactive flow: fetch all keys, across pages, and let the user pick one.
				const fetchSpinner = createSpinner("Fetching API keys...");
				let keys: any[] = [];
				try {
					keys = await client.keys.listAll();
					fetchSpinner.succeed();
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
					// Keys timestamps are epoch seconds, so multiply by 1000 for a JS Date.
					const seconds = typeof value === "number" ? value : Number(value);
					const d = new Date(isNaN(seconds) ? (value as string) : seconds * 1000);
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
					process.exitCode = EXIT_CODES.ERROR;
				} else {
					spinner.succeed("API key is valid.");
				}
			} catch (e: any) {
				spinner.fail("Failed to validate API key");
				await handleCliError(e);
			}
		});
}
