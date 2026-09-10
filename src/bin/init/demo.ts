import chalk from "chalk";
import { execa } from "execa";
import fs from "fs/promises";
import inquirer from "inquirer";
import { createSpinner } from "../utils/spinner";
import path from "path";
import { randomUUID } from "crypto";

import { hasCachedToken, loginAndGetToken, LoginResult } from "../utils/github-auth";
import { templateRepoHttps, templateRepoSsh } from "../utils/template-repo";
import { customizeTemplate } from "./customize";
import { generateDemoApplicationsContent } from "./file-generators/applications";
import { generateDemoInputsContent, resolveInputTypes } from "./file-generators/inputs";
import { promptForApplicationDetails } from "./prompts/applications";
import { InputConfig, promptForInputs } from "./prompts/inputs";

const REPO_URL_SSH = templateRepoSsh;
const REPO_URL_HTTPS = templateRepoHttps;
let loginResult: LoginResult = { success: false, token: undefined };
async function cloneRepository(projectDir: string, repoUrlSsh: string, repoUrlHttps: string): Promise<boolean> {
	const spinner = createSpinner(`Cloning template repository using SSH from ${repoUrlSsh} into '${projectDir}'...`);
	try {
		await execa("git", ["clone", repoUrlSsh, projectDir, "--recursive"], {
			stdio: "ignore",
			env: {
				GIT_TERMINAL_PROMPT: "0",
			},
		});
		spinner.succeed("Repository cloned successfully using SSH.");
		return true;
	} catch (error: any) {
		spinner.fail("Failed to clone repository using SSH.");

		console.log(chalk.yellow("SSH authentication with GitHub failed."));
		console.log(chalk.yellow("Attempting to clone using HTTPS with GitHub authentication."));

		// --- HTTPS Fallback with Current Directory ---
		const currentDir = process.cwd();

		const tempGitConfigPath = path.join(currentDir, `.gitconfig-signaloid-temp-${randomUUID()}`);
		const tempNetrcPath = path.join(currentDir, ".netrc");
		const tempNpmrcPath = path.join(currentDir, ".npmrc");

		try {
			// 1. Create auth files in the current working directory
			loginResult = await loginAndGetToken(currentDir);
			if (!loginResult.success) {
				return false;
			}

			// 2. Create a temporary gitconfig in the current directory
			const gitConfigContent = `
[url "https://github.com/"]
    insteadOf = git@github.com:
[http]
    netrcFile = ${tempNetrcPath}
`;
			await fs.writeFile(tempGitConfigPath, gitConfigContent);

			// 3. Clone the repository using the temporary gitconfig
			await execa("git", ["clone", `https://github.com/${repoUrlHttps}`, projectDir, "--recursive"], {
				stdio: "ignore",
				env: {
					GIT_CONFIG_GLOBAL: tempGitConfigPath,
				},
			});
			// 4. Move the .npmrc file to the final project directory
			await fs.rename(tempNpmrcPath, path.join(projectDir, ".npmrc"));
			return true;
		} catch (retryError: any) {
			if (retryError?.name === "ExitPromptError") {
				throw retryError;
			}
			console.error(retryError.stderr || retryError.message);
			return false;
		} finally {
			// 5. Clean up the temporary files from the current directory
			await fs.rm(tempGitConfigPath, { recursive: true, force: true });
			await fs.rm(tempNetrcPath, { recursive: true, force: true });
			// Also try to remove .npmrc in case the rename failed or login failed before clone
			await fs.rm(tempNpmrcPath, { recursive: true, force: true });
		}
	}
}

async function installDependencies(projectDir: string): Promise<boolean> {
	// A token collected during the auth check only reaches npm once the project
	// has its own .npmrc. Write it before the first attempt rather than letting
	// that attempt fail and prompting again.
	if (!loginResult.token && hasCachedToken()) {
		loginResult = await loginAndGetToken(projectDir);
	}

	const spinner = createSpinner("Installing dependencies...");
	try {
		// First attempt to install
		await execa("npm", ["install"], {
			cwd: projectDir,
			stdio: "ignore",
			env: {
				CI: "true",
			},
		});
		spinner.succeed("Dependencies installed.");
		return true;
	} catch (error: any) {
		spinner.fail("Failed to install dependencies.");

		// If the first attempt fails, start the interactive retry flow
		console.log(
			chalk.yellow("\nThis might be due to missing authentication for a private GitHub package registry."),
		);

		// Reuse the existing GitHub login utility
		if (!loginResult.token) {
			loginResult = await loginAndGetToken(projectDir);
		}
		if (!loginResult.success) {
			console.error(chalk.red("Login failed. Please try again or configure npm manually."));
			return false;
		}

		console.log(chalk.green("Login successful. Retrying dependency installation..."));

		// Second attempt to install
		const retrySpinner = createSpinner("Retrying to install dependencies...");
		try {
			await execa("npm", ["install"], { cwd: projectDir, stdio: "inherit" });
			retrySpinner.succeed("Dependencies installed successfully on retry.");
			return true;
		} catch (retryError: any) {
			retrySpinner.fail("Failed to install dependencies on retry.");
			console.log(chalk.cyan("You may need to verify your GitHub token has the 'read:packages' permission."));
			return false;
		}
	}
}

async function displayFinalInstructions(projectPath: string) {
	console.log(chalk.green.bold("\n✨ Project setup complete!\n"));
	console.log(`Navigate to your new project by running:`);
	console.log(chalk.cyan(`  cd ${projectPath}`));
	console.log(`\nTo run the application, execute:`);
	console.log(chalk.cyan(`  npm start`));
}

async function buildDesignSystem(projectDir: string): Promise<boolean> {
	// Angular CLI is only on disk once the install worked. Never let this take
	// down the whole command.
	try {
		await execa("npm", ["run", "disable-analytics"], { cwd: projectDir, stdio: "inherit" });
	} catch {
		// Analytics stay at their default. Not worth failing the setup over.
	}
	const spinner = createSpinner("Building the design system...");
	try {
		await execa("npm", ["run", "build:design-system"], {
			cwd: projectDir,
			stdio: "inherit",
			env: {
				CI: "true",
				NG_CLI_ANALYTICS: "ci",
			},
		});

		spinner.succeed("Design system built successfully.");
		return true;
	} catch (error: any) {
		spinner.fail("Failed to build design system.");
		console.log(error.stderr || error.shortMessage || error.message);
		console.log(
			chalk.cyan(
				"Please check the error message above. You may need to configure npm to access the Signaloid package registry.",
			),
		);
		return false;
	}
}

export async function createDemo(
	projectNameFromArg: string | undefined,
	outputDir: string,
	jsonOutputPath?: string,
	jsonInputPath?: string,
) {
	let appDetails;
	let inputs: InputConfig[] = [];

	// --- Notify user if JSON output is requested ---
	if (jsonOutputPath) {
		const resolvedPath = path.resolve(jsonOutputPath);
		console.log(chalk.blue(`\nConfiguration will be saved to: ${chalk.cyan(resolvedPath)}\n`));
	}

	// --- Check if JSON input file is provided ---
	if (jsonInputPath) {
		const jsonSpinner = createSpinner("Reading configuration from JSON file...");
		try {
			const resolvedJsonPath = path.resolve(jsonInputPath);
			const jsonContent = await fs.readFile(resolvedJsonPath, "utf-8");
			const configData = JSON.parse(jsonContent);

			if (!configData.applicationDetails || !configData.inputs) {
				throw new Error("Invalid JSON format. Expected 'applicationDetails' and 'inputs' properties.");
			}

			appDetails = configData.applicationDetails;
			// Fail here rather than after the clone, so a bad config leaves no half-made project.
			inputs = resolveInputTypes(configData.inputs);
			jsonSpinner.succeed(`Configuration loaded from ${resolvedJsonPath}`);
		} catch (error: any) {
			jsonSpinner.fail("Failed to read JSON configuration file.");
			console.error(chalk.red(error.message));
			return;
		}
	} else {
		// --- Run Interactive Wizard to get repo details ---
		console.log("First, let's get some details about the application");
		appDetails = await promptForApplicationDetails();
	}

	const projectName = projectNameFromArg || appDetails.title;
	const targetDir = outputDir ? path.resolve(outputDir) : process.cwd();
	const projectDir = path.join(targetDir, projectName);

	if ((await fs.stat(projectDir).catch(() => null))?.isDirectory()) {
		console.log(chalk.yellow(`Directory '${path.relative(process.cwd(), projectDir)}' already exists.`));
		const { overwrite } = await inquirer.prompt([
			{
				type: "confirm",
				name: "overwrite",
				message: `Directory '${path.relative(
					process.cwd(),
					projectDir,
				)}' already exists. Do you want to overwrite it?`,
				default: false,
			},
		]);

		if (!overwrite) {
			console.log(chalk.yellow("Project creation cancelled."));
			return;
		}

		const deleteSpinner = createSpinner(`Deleting existing directory '${projectDir}'...`);
		try {
			await fs.rm(projectDir, { recursive: true, force: true });
			deleteSpinner.succeed("Existing directory deleted.");
		} catch (error) {
			deleteSpinner.fail("Failed to delete existing directory.");
			console.error(chalk.red("Please delete the directory manually and try again."));
			return;
		}
	}

	// --- Clone Repository ---
	const cloned = await cloneRepository(projectDir, REPO_URL_SSH, REPO_URL_HTTPS);
	if (!cloned) {
		return;
	}

	// --- Continue with the rest of the wizard ---
	if (!jsonInputPath) {
		console.log("\nNow, let's configure the inputs for your application.");
		inputs = await promptForInputs();
	}

	// --- Write JSON Output if requested ---
	if (jsonOutputPath) {
		const jsonSpinner = createSpinner("Writing configuration to JSON file...");
		try {
			const configData = {
				applicationDetails: appDetails,
				inputs: inputs,
			};
			const resolvedJsonPath = path.resolve(jsonOutputPath);
			await fs.writeFile(resolvedJsonPath, JSON.stringify(configData, null, 2));
			jsonSpinner.succeed(`Configuration written to ${resolvedJsonPath}`);
			console.log(chalk.green(`\nConfiguration successfully saved to: ${chalk.cyan(resolvedJsonPath)}\n`));
		} catch (error) {
			jsonSpinner.fail("Failed to write JSON configuration file.");
			console.error(error);
		}
	}

	// Persist config so init web-app:export can read it back from the project later.
	try {
		const projectConfig = {
			applicationDetails: appDetails,
			inputs: inputs,
		};
		await fs.writeFile(path.join(projectDir, "signaloid.config.json"), JSON.stringify(projectConfig, null, 2));
	} catch (error) {
		console.error(chalk.yellow("Warning: could not write signaloid.config.json to the project."));
	}

	// --- Generate Files ---
	const fileGenSpinner = createSpinner("Generating configuration files...");
	try {
		const appContent = await generateDemoApplicationsContent(appDetails);
		const inputContent = await generateDemoInputsContent(inputs);

		await fs.writeFile(path.join(projectDir, "src", "app", "models", "demo.applications.ts"), appContent);
		await fs.writeFile(path.join(projectDir, "src", "app", "models", "demo.inputs.ts"), inputContent);
		fileGenSpinner.succeed("Configuration files generated.");
	} catch (error) {
		fileGenSpinner.fail("Failed to generate configuration files.");
		console.error(error);
		return;
	}

	// --- Finalize Project ---
	await customizeTemplate(projectDir, projectName);

	const installed = await installDependencies(projectDir);
	if (!installed) {
		console.log(
			chalk.yellow(
				`\nThe project was created at '${path.relative(process.cwd(), projectDir)}' but its dependencies are missing.`,
			),
		);
		console.log(chalk.yellow("Fix the install error above, then run 'npm install' in the project directory."));
		return;
	}
	await buildDesignSystem(projectDir);
	await displayFinalInstructions(path.relative(process.cwd(), projectDir));
}
