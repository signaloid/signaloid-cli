import { Command } from "commander";
import { createDemo } from "../init/demo";
import inquirer from "inquirer";
import path from "path";
import { promises as fs } from "fs";
import ora from "ora";
import { validateApiKey } from "../utils/validate-api-key";
import chalk from "chalk";
import { updateApiKeyInEnvFile } from "../utils/update-api-key-to-env-files";
import { checkGithubAuth } from "../utils/github-auth";
import { config } from "../../config/env.config";

export default function (program: Command) {
	const initDemo = program.command("init").description("Initialize project");
	initDemo
		.command("web-app")
		.description("Creates application structure ")
		.action(async () => {
			const hasAuth = await checkGithubAuth();
			if (!hasAuth) {
				console.log(chalk.red("Aborting project initialization due to failed GitHub authentication."));
				return;
			}
			const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
				{
					type: "password",
					name: "apiKey",
					message: `Create Signaloid API key on ${config.SIGNALOID_URL}/settings/api and paste it here (it will be stored in your environment files):`,
					validate: (input: string) => {
						if (input.trim().length === 0) {
							return "API key cannot be empty.";
						}
						return true;
					},
				},
			]);
			const validateionSpinner = ora("Validating API key...").start();
			const isValid = await validateApiKey(apiKey);
			if (!isValid) {
				validateionSpinner.fail("Invalid API key.");
				console.log(chalk.red("Please create a valid API key and try again."));
				return;
			} else {
				validateionSpinner.succeed("API key is valid.");
			}

			console.log(chalk.bold("\n\nWelcome to the Signaloid API application generator!\n\n"));
			const { name, outputDir } = await inquirer.prompt<{ name: string; outputDir: string }>([
				{
					type: "input",
					name: "outputDir",
					message: "Where should the project be created? (leave blank for current directory)",
					default: ".",
				},
				{
					type: "input",
					name: "name",
					message: "What is your project's name?",
					default: "Signaloid-API-Application",
					validate: (input: string) => {
						if (input.trim().length === 0) {
							return "Project name cannot be empty.";
						}
						return true;
					},
				},
			]);
			await createDemo(name, outputDir);

			const projectPath = path.join(outputDir, name);
			const envFiles = [
				path.join(projectPath, "src", "environments", "environment.ts"),
			];

			const apiKeyProperty = `\nSIGNALOID_API_KEY: '${apiKey}'`;

			try {
				// Create a spinner for user feedback, similar to your other functions
				const spinner = ora("Updating API key in environment files...").start();

				// Use Promise.all to update files concurrently
				await Promise.all(envFiles.map((file) => updateApiKeyInEnvFile(file, apiKey)));

				spinner.succeed("Environment files updated successfully.");
			} catch (error) {
				// The spinner (if used) should be failed here.
				console.error("Failed to update environment files.");
			}
		});
}
