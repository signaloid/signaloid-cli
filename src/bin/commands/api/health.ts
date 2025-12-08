import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { handleCliError } from "../../utils/error-handler";

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
	program
		.command("health")
		.description("Ping Signaloid API")
		.action(async () => {
			const spinner = ora("Pinging...").start();
			try {
				const client = makeClient(await loadConfig());
				const res = await client.health.getOverallHealth();
				spinner.succeed("OK");
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Unhealthy");
				await handleCliError(e);
			}
		});
}
