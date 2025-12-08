import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";

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
	const cmd = program.command("webhooks").description("Manage webhooks");

	cmd.command("list")
		.description("List webhooks")
		.action(async () => {
			const spinner = ora("Fetching webhooks...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.list();
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to list webhooks");
				await handleCliError(e);
			}
		});

	cmd.command("get")
		.description("Get a webhook")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = ora("Fetching webhook...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.getOne(id);
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get webhook");
				await handleCliError(e);
			}
		});

	// Fixed: final object is always WebhookDetails
	cmd.command("create")
		.description("Create a webhook")
		.requiredOption("--url <url>", "Target URL")
		.option("--events <e1,e2,...>", "Comma-separated event list")
		.option("--description <text>", "Optional description")
		.option("--status <active|disabled>", "Set status after create")
		.option("--payload-file <json>", "Optional JSON payload to merge (advanced)")
		.action(async (opts) => {
			const spinner = ora("Creating webhook...").start();
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
				console.log(JSON.stringify(details, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to create webhook");
				await handleCliError(e);
			}
		});

	cmd.command("update")
		.description("Update a webhook")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.option("--url <url>", "New URL")
		.option("--events <e1,e2,...>", "Comma-separated event list")
		.option("--description <text>", "New description")
		.option("--status <active|disabled>", "Set status")
		.option("--active", "Shortcut for --status active")
		.option("--disabled", "Shortcut for --status disabled")
		.option("--payload-file <json>", "Optional JSON payload to merge (advanced)")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = ora("Updating webhook...").start();
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
				console.log(JSON.stringify(res, null, 2));
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
			const spinner = ora("Deleting webhook...").start();
			try {
				const client = makeClient(await loadConfig());
				await client.webhooks.delete(id);
				spinner.succeed("Webhook deleted");
				console.log(JSON.stringify({ webhookId: id, deleted: true }, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to delete webhook");
				await handleCliError(e);
			}
		});

	cmd.command("stats")
		.description("Quick webhook stats")
		.action(async () => {
			const spinner = ora("Computing webhook stats...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.getStats();
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to get stats");
				await handleCliError(e);
			}
		});

	cmd.command("enable")
		.description("Enable a webhook (status=active)")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = ora("Enabling webhook...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.enable(id);
				spinner.succeed("Webhook enabled");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to enable webhook");
				await handleCliError(e);
			}
		});

	cmd.command("disable")
		.description("Disable a webhook (status=disabled)")
		.requiredOption("--webhook-id <id>", "Webhook ID")
		.action(async (opts) => {
			const id = String(opts.webhookId);
			const spinner = ora("Disabling webhook...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.webhooks.disable(id);
				spinner.succeed("Webhook disabled");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to disable webhook");
				await handleCliError(e);
			}
		});
}
