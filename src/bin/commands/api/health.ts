import { Command } from "commander";
import { createSpinner } from "../../utils/spinner";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { handleCliError } from "../../utils/error-handler";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printData } from "../../utils/verbosity";

/**
 * Registers the 'health' command for checking Signaloid API health status.
 *
 * This command pings the Signaloid API to verify connectivity and service availability,
 * providing immediate feedback on the overall health of the API endpoints.
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli health
 * ```
 */
export default function health(program: Command) {
	const cmd = program.command("health").description("Check API health and connectivity");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");
	cmd.action(async () => {
		const spinner = createSpinner("Pinging...");
		try {
			const client = makeClient(await loadConfig());
			const res = await client.health.getOverallHealth();
			spinner.succeed("OK");
			printData(JSON.stringify(res, null, 2));
		} catch (e: any) {
			spinner.fail("Unhealthy");
			await handleCliError(e);
		}
	});
}
