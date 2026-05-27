import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { OutputFormat, displayResource } from "../../utils/output";
import { printData } from "../../utils/verbosity";

export default function organizations(program: Command) {
	const cmd = program.command("organizations").alias("orgs").description("Manage organizations");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("get")
		.description("Get organization details")
		.requiredOption("--org-id <id>", "Organization ID")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching organization...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.get(String(opts.orgId));
				spinner.succeed();
				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Organization Details");
				}
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	cmd.command("create")
		.description("Create a new organization")
		.requiredOption("--name <name>", "Organization name")
		.option("--dedicated-instance <name>", "Dedicated instance name")
		.action(async (opts) => {
			const spinner = createSpinner("Creating organization...");
			try {
				const client = makeClient(await loadConfig());
				const payload: { Name: string; DedicatedInstanceName?: string } = {
					Name: opts.name,
				};
				if (opts.dedicatedInstance) payload.DedicatedInstanceName = opts.dedicatedInstance;
				const res = await client.organizations.create(payload);
				spinner.succeed("Organization created");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	const usersCmd = cmd.command("users").description("Manage organization users");

	usersCmd
		.command("list")
		.description("List organization users")
		.requiredOption("--org-id <id>", "Organization ID")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching users...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.listUsers(String(opts.orgId));
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	usersCmd
		.command("invite")
		.description("Invite a user to the organization")
		.requiredOption("--org-id <id>", "Organization ID")
		.requiredOption("--email <email>", "User email")
		.requiredOption("--role <Owner|Member>", "User role")
		.action(async (opts) => {
			const spinner = createSpinner("Inviting user...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.inviteUser(String(opts.orgId), {
					Email: opts.email,
					Role: opts.role,
				});
				spinner.succeed("User invited");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	usersCmd
		.command("update-role")
		.description("Update a user's role")
		.requiredOption("--org-id <id>", "Organization ID")
		.requiredOption("--user-id <id>", "User ID")
		.requiredOption("--role <Owner|Member>", "New role")
		.action(async (opts) => {
			const spinner = createSpinner("Updating role...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.updateUserRole(
					String(opts.orgId),
					String(opts.userId),
					{ Role: opts.role },
				);
				spinner.succeed("Role updated");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	usersCmd
		.command("remove")
		.description("Remove a user or cancel a pending invitation")
		.requiredOption("--org-id <id>", "Organization ID")
		.requiredOption("--identifier <id-or-email>", "User ID or email (for pending invitations)")
		.action(async (opts) => {
			const spinner = createSpinner("Removing user...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.removeUser(
					String(opts.orgId),
					String(opts.identifier),
				);
				spinner.succeed("User removed");
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});

	cmd.command("invitations")
		.description("List pending invitations for the current user")
		.action(async () => {
			const spinner = createSpinner("Fetching invitations...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.organizations.listInvitations();
				spinner.succeed();
				printData(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				await handleCliError(e);
			}
		});
}
