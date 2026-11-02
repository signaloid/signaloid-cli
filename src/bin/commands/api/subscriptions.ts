import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { OutputFormat, displayResource } from "../../utils/output";
import { printData } from "../../utils/verbosity";

/**
 * Registers the 'subscriptions' command and subcommands for managing account subscriptions.
 *
 * This command provides functionality for viewing Signaloid account subscription details.
 *
 * Available subcommands:
 * - get: Retrieve current subscription information
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli subscriptions get
 * ```
 */
export default function subscriptions(program: Command) {
	const cmd = program.command("subscriptions").description("View account subscriptions");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("get")
		.description("View current subscription details")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching subscription...");
			try {
				const client = makeClient(await loadConfig());
				const res = await client.subscriptions.get();
				spinner.succeed();

				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(res, null, 2));
				} else {
					displayResource(res, "Subscription Details");
				}
			} catch (e: any) {
				spinner.fail("Failed to fetch subscription");
				await handleCliError(e);
			}
		});
}
