import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import {
	addPaginationOptions,
	createCustomTable,
	displayResource,
	finishListingSpinner,
	fetchWithPagination,
	limitHelp,
	OutputFormat,
	printListing,
	printListingTable,
	parseColumns,
	showAvailableColumns,
} from "../../utils/output";
import { printData } from "../../utils/verbosity";
import type {
	CreateWebhookRequest,
	CreateWebhookResponse,
	UpdateWebhookRequest,
	WebhookEventType,
	WebhookStatus,
} from "@signaloid/scce-sdk";

const WEBHOOK_EVENTS = Object.keys({
	"task-status": true,
	"build-status": true,
	"task-stats": true,
	"build-stats": true,
	"task-count": true,
	"build-count": true,
} satisfies Record<WebhookEventType, true>) as WebhookEventType[];
const EVENT_LIST = WEBHOOK_EVENTS.join(", ");

function parseEvents(maybeCsv?: string): WebhookEventType[] | undefined {
	if (!maybeCsv) return undefined;
	const arr = String(maybeCsv)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const unknown = arr.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEventType));
	if (unknown.length) {
		throw new Error(`Unknown event ${unknown.join(", ")}. Events are: ${EVENT_LIST}.`);
	}
	return arr.length ? (arr as WebhookEventType[]) : undefined;
}

// The webhook request fields the API renamed to PascalCase, and their new names.
const RENAMED_WEBHOOK_FIELDS: Record<string, string> = {
	url: "URL",
	events: "Events",
	description: "Description",
	status: "Status",
};

/** Loads a --payload-file, refusing the lowercase field names the API no longer accepts. */
async function loadWebhookPayloadFile(file?: string): Promise<Record<string, unknown>> {
	const extra = (await loadJsonIfPath(file)) || {};
	const renamed = Object.keys(extra).filter((key) => key in RENAMED_WEBHOOK_FIELDS);
	if (renamed.length) {
		const hint = renamed.map((key) => `${key} → ${RENAMED_WEBHOOK_FIELDS[key]}`).join(", ");
		throw new Error(
			`${file} uses lowercase webhook fields, which the API no longer accepts. Rename them: ${hint}.`,
		);
	}
	return extra;
}

function resolveStatusFlag(opts: { status?: string; active?: boolean; disabled?: boolean }): WebhookStatus | undefined {
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

	addPaginationOptions(cmd.command("list"), {
		limitHelp: limitHelp(100),
		startKey: false,
	})
		.description("List configured webhooks")
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
				const result = await fetchWithPagination((query) => client.webhooks.list(query), "Webhooks", opts);
				finishListingSpinner(spinner, result);

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printListing("Webhooks", result);
				} else {
					const selectedColumns = parseColumns(opts.columns);
					printListingTable("webhooks", result, selectedColumns);
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

	// Prints the create response, which is the only place the API returns the signing Secret.
	cmd.command("create")
		.description("Create a new webhook endpoint")
		.requiredOption("--url <url>", "Target URL")
		.option("--events <e1,e2,...>", `Comma-separated event list: ${EVENT_LIST}`)
		.option("--description <text>", "Optional description")
		.option("--status <active|disabled>", "Set status after create")
		.option("--payload-file <json>", "Optional JSON payload to merge (advanced)")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Creating webhook...");
			// The Secret is never returned again, so once the webhook exists it is printed even
			// if the status update that follows fails.
			let created: CreateWebhookResponse | undefined;
			try {
				// Everything that can be refused is checked before the webhook exists.
				const status = resolveStatusFlag({ status: opts.status });
				const basePayload: Partial<CreateWebhookRequest> = {
					URL: opts.url,
					Events: parseEvents(opts.events),
					Description: typeof opts.description === "string" ? opts.description : undefined,
				};
				const createPayload = { ...basePayload, ...(await loadWebhookPayloadFile(opts.payloadFile)) };
				if (!Array.isArray(createPayload.Events) || createPayload.Events.length === 0) {
					throw new Error(`--events is required. Events are: ${EVENT_LIST}.`);
				}

				const client = makeClient(await loadConfig());
				created = await client.webhooks.create(createPayload as CreateWebhookRequest);
				const details = status
					? {
							...(await client.webhooks.update(created.WebhookID, { Status: status })),
							Secret: created.Secret,
						}
					: created;

				spinner.succeed("Webhook created");

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(details, null, 2));
				} else {
					displayResource(details, "Created Webhook");
				}
			} catch (e: any) {
				if (created) {
					printData(JSON.stringify(created, null, 2));
					spinner.fail("Webhook created, but setting its status failed");
				} else {
					spinner.fail("Failed to create webhook");
				}
				await handleCliError(e);
			}
		});

	cmd.command("update")
		.description("Update an existing webhook's configuration")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--url <url>", "New URL")
		.option("--events <e1,e2,...>", `Comma-separated event list: ${EVENT_LIST}`)
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

				const payload: Partial<UpdateWebhookRequest> & Record<string, unknown> = {};
				if (typeof opts.url === "string") payload.URL = opts.url;
				const events = parseEvents(opts.events);
				if (events) payload.Events = events;
				if (typeof opts.description === "string") payload.Description = opts.description;

				const status = resolveStatusFlag({
					status: opts.status,
					active: opts.active,
					disabled: opts.disabled,
				});
				if (status) payload.Status = status;

				Object.assign(payload, await loadWebhookPayloadFile(opts.payloadFile));

				const res = await client.webhooks.update(id, payload as UpdateWebhookRequest);
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
