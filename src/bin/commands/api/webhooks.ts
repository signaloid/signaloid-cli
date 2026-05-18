import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { OutputFormat, displayResource, createCustomTable, parseColumns, showAvailableColumns } from "../../utils/output";
import { printData } from "../../utils/verbosity";

function parseEvents(maybeCsv?: string): string[] | undefined {
	if (!maybeCsv) return undefined;
	const arr = String(maybeCsv)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return arr.length ? arr : undefined;
}

function resolveStatusFlag(opts: {
	status?: string;
	active?: boolean;
	disabled?: boolean;
}): "active" | "disabled" | undefined {
	if (opts.status) {
		const s = String(opts.status).toLowerCase();
		if (s === "active" || s === "disabled") return s;
		throw new Error(`--status must be "active" or "disabled" (got: ${opts.status})`);
	}
	if (opts.active && opts.disabled) throw new Error("Use either --active or --disabled, not both.");
	if (opts.active) return "active";
	if (opts.disabled) return "disabled";
	return undefined;
}

/**
 * Registers the 'webhooks' command and subcommands for managing webhook integrations.
 *
 * This command provides comprehensive webhook management functionality including
 * listing webhooks, creating new webhook endpoints, updating configurations,
 * and deleting webhooks. Webhooks allow external services to receive real-time
 * notifications about events in the Signaloid platform.
 *
 * Available subcommands:
 * - list: List all configured webhooks
 * - get: Get details of a specific webhook
 * - create: Create a new webhook endpoint
 * - update: Update an existing webhook's configuration
 * - delete: Delete a webhook
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli webhooks list
 * signaloid-cli webhooks get --webhook-id webhook-123
 * signaloid-cli webhooks create --url https://example.com/webhook --events build.completed,task.completed
 * signaloid-cli webhooks update --webhook-id webhook-123 --status active
 * signaloid-cli webhooks delete --webhook-id webhook-123
 * ```
 */
export default function webhooks(program: Command) {
	const cmd = program.command("webhooks").description("Configure webhooks for event notifications");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("list")
		.description("List all configured webhooks")
		.option("--format <type>", "Output format: table|json", "json")
		.option("--columns <cols>", "Columns to display (comma-separated) or 'help' to see available columns")
		.action(async (opts) => {
			if (opts.columns === "help") {
				showAvailableColumns("webhooks");
				return;
			}

			const spinner = createSpinner("Fetching webhooks...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.list();
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					const selectedColumns = parseColumns(opts.columns);
					const webhooks = (res as any).Webhooks || (res as any).webhooks || [];
					printData(createCustomTable("webhooks", webhooks, selectedColumns));
				}
			} catch (e: any) {
				spinner.fail("Failed to list webhooks");
				await handleCliError(e);
			}
		});

	cmd.command("get")
		.description("Get details of a specific webhook")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = createSpinner("Fetching webhook...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.getOne(id);
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Webhook Details");
				}
			} catch (e: any) {
				spinner.fail("Failed to get webhook");
				await handleCliError(e);
			}
		});

	// Fixed: final object is always WebhookDetails
	cmd.command("create")
		.description("Create a new webhook endpoint")
		.requiredOption("--url <url>", "Target URL")
		.option("--events <e1,e2,...>", "Comma-separated event list")
		.option("--description <text>", "Optional description")
		.option("--status <active|disabled>", "Set status after create")
		.option("--payload-file <json>", "Optional JSON payload to merge (advanced)")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Creating webhook...");
			try {
				const client = makeClient(await loadConfig());

				const basePayload: Record<string, any> = {
					url: opts.url,
					events: parseEvents(opts.events),
					description: typeof opts.description === "string" ? opts.description : undefined,
				};

				const extra = (await loadJsonIfPath(opts.payloadFile)) || {};
				const createPayload = { ...basePayload, ...extra };

				// Create first
				const created = await client.webhooks.create(createPayload as any);

				// Then ensure we return WebhookDetails
				const status = resolveStatusFlag({ status: opts.status });
				const details = status
					? await client.webhooks.update(created.webhookId, { status })
					: await client.webhooks.getOne(created.webhookId);

				spinner.succeed("Webhook created");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(details, null, 2));
				} else {
					displayResource(details, "Created Webhook");
				}
			} catch (e: any) {
				spinner.fail("Failed to create webhook");
				await handleCliError(e);
			}
		});

	cmd.command("update")
		.description("Update an existing webhook's configuration")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--url <url>", "New URL")
		.option("--events <e1,e2,...>", "Comma-separated event list")
		.option("--description <text>", "New description")
		.option("--status <active|disabled>", "Set status")
		.option("--active", "Shortcut for --status active")
		.option("--disabled", "Shortcut for --status disabled")
		.option("--payload-file <json>", "Optional JSON payload to merge (advanced)")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = createSpinner("Updating webhook...");
			try {
				const client = makeClient(await loadConfig());

				const payload: Record<string, any> = {};
				if (typeof opts.url === "string") payload.url = opts.url;
				const events = parseEvents(opts.events);
				if (events) payload.events = events;
				if (typeof opts.description === "string") payload.description = opts.description;

				const status = resolveStatusFlag({
					status: opts.status,
					active: opts.active,
					disabled: opts.disabled,
				});
				if (status) payload.status = status;

				const extra = (await loadJsonIfPath(opts.payloadFile)) || {};
				Object.assign(payload, extra);

				const res = await client.webhooks.update(id, payload as any);
				spinner.succeed("Webhook updated");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Updated Webhook");
				}
			} catch (e: any) {
				spinner.fail("Failed to update webhook");
				await handleCliError(e);
			}
		});

	cmd.command("delete")
		.description("Delete a webhook")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = createSpinner("Deleting webhook...");
			try {
				const client = makeClient(await loadConfig());
				await client.webhooks.delete(id);
				spinner.succeed("Webhook deleted");
				printData(JSON.stringify({ WebhookID: id, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete webhook");
				await handleCliError(e);
			}
		});

	cmd.command("stats")
		.description("View webhook statistics")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Computing webhook stats...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.getStats();
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Webhook Statistics");
				}
			} catch (e: any) {
				spinner.fail("Failed to get stats");
				await handleCliError(e);
			}
		});

	cmd.command("enable")
		.description("Enable a webhook (set status to active)")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = createSpinner("Enabling webhook...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.enable(id);
				spinner.succeed("Webhook enabled");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Enabled Webhook");
				}
			} catch (e: any) {
				spinner.fail("Failed to enable webhook");
				await handleCliError(e);
			}
		});

	cmd.command("disable")
		.description("Disable a webhook (set status to disabled)")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = createSpinner("Disabling webhook...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.disable(id);
				spinner.succeed("Webhook disabled");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Disabled Webhook");
				}
			} catch (e: any) {
				spinner.fail("Failed to disable webhook");
				await handleCliError(e);
			}
		});
}
