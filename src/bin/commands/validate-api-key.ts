import { Command } from "commander";
import { validateApiKey } from "../utils/validate-api-key";
import ora from "ora";
import chalk from "chalk";
import { config } from "../../config/env.config";

export default function (program: Command) {
	program
		.command("validate-api-key")
		.description("Validates a Signaloid API key.")
		.arguments("<apiKey>")
		.action(async (apiKey: string) => {
			const spinner = ora("Validating API key...").start();
			const isValid = await validateApiKey(apiKey);
			if (!isValid) {
				spinner.fail("Invalid API key.");
				console.log(chalk.red(`You can create an api key on ${config.SIGNALOID_URL}/settings/api`));
			} else {
				spinner.succeed("API key is valid.");
			}
		});
}
