import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { loadJsonIfPath } from "../../utils/params";
import { handleCliError } from "../../utils/error-handler";

/**
 * Registers the 'samples' command and subcommands for retrieving statistical samples.
 *
 * This command provides functionality for retrieving Monte Carlo samples from
 * Signaloid task outputs, allowing for detailed statistical analysis of
 * uncertainty-tracked values.
 *
 * Available subcommands:
 * - from-ValueId: Retrieve samples for a specific task and value ID
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli samples from-ValueId --task task-123 --value value-456 --count 1000
 * ```
 */
export default function samples(program: Command) {
	const cmd = program.command("samples").description("Samples API");

	cmd.command("from-value-id")
		.description("Get samples from a Reference Core task using output Value IDs")
		.requiredOption("--task-id <id>", "Task ID")
		.requiredOption("--value-id <id>", "Value ID")
		.option("--count <n>", "Number of samples", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const spinner = ora("Fetching samples...").start();
			try {
				const client = makeClient(await loadConfig());

				const taskId = opts.taskId;
				const valueId = opts.valueId;

				if (!taskId || !valueId) {
					throw new Error("Both --task-id and --value-id are required");
				}

				const res = await client.samples.getSamples({
					taskID: taskId,
					valueID: valueId,
					count: opts.count,
				});
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch samples");
				await handleCliError(e);
			}
		});

	cmd.command("from-ux-string")
		.description("Get samples from Ux strings")
		.option("--ux-string <ux-string>", "Ux string")
		.option("--file <json>", "JSON file with Ux string")
		.option("--count <n>", "Number of samples", (v) => parseInt(v, 10))
		.action(async (opts) => {
			const spinner = ora("Fetching samples from Ux string...").start();
			if (!opts.uxString && !opts.file) {
				spinner.fail("Either --ux-string or --file is required");
				process.exit(1);
			}
			try {
				const client = makeClient(await loadConfig());
				let res;
				if (opts.file) {
					const payload = await loadJsonIfPath(opts.file);
					res = await client.samples.getSamplesFromUx(payload as any, opts.count);
				} else {
					const raw = opts.uxString;
					res = await client.samples.getSamplesFromUx(raw, opts.count);
				}
				spinner.succeed();
				console.log(JSON.stringify(res, null, 2));
			} catch (e: any) {
				spinner.fail("Failed to fetch samples from Ux string");
				await handleCliError(e);
			}
		});
}
