import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { validateEmail, validateNonEmptyString } from "../../utils/validation";
import { handleCliError } from "../../utils/error-handler";

/**
 * Registers the 'auth' command and subcommands for authentication management.
 *
 * This command provides authentication functionality including login via API key
 * or email/password, checking current authentication status, and logging out.
 *
 * Available subcommands:
 * - login: Authenticate using API key or email/password credentials
 * - whoami: Display current authenticated user information
 * - logout: Clear local authentication and sign out
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli auth login --api-key sk_1234567890abcdef
 * signaloid-cli auth login --email user@example.com --password mypass
 * signaloid-cli auth whoami
 * signaloid-cli auth logout
 * ```
 */
export default function auth(program: Command) {
	const cmd = program.command("auth").description("Authenticate with Signaloid");

	cmd.command("login")
		.description("Login via API key or email/password")
		// Optional values so you can do: --api-key or --api-key <key>
		.option("--api-key [key]", "Signaloid API key")
		.option("--email [email]", "Email for password login")
		.option("--password <password>", "Password for password login")
		.action(async (opts) => {
			const cfg = await loadConfig();
			const spinner = ora(); // start later, after prompts

			try {
				let apiKeyOpt = opts.apiKey as string | boolean | undefined;
				let emailOpt = opts.email as string | boolean | undefined;
				let password = opts.password as string | undefined;

				//
				// 0. If no options at all → ask user which method to use
				//
				if (apiKeyOpt === undefined && emailOpt === undefined && password === undefined) {
					const choice = await inquirer.prompt<{ method: "apikey" | "email" }>([
						{
							type: "list",
							name: "method",
							message: "How would you like to authenticate?",
							choices: [
								{ name: "API key", value: "apikey" },
								{ name: "Email & password", value: "email" },
							],
						},
					]);

					if (choice.method === "apikey") {
						apiKeyOpt = true; // triggers API key flow, will prompt for value
					} else {
						emailOpt = true; // triggers email/password flow, will prompt for email + password
					}
				}

				//
				// 1. API KEY LOGIN FLOW
				//
				if (apiKeyOpt !== undefined) {
					console.log("API key mode selected");

					let apiKey: string | undefined;

					if (typeof apiKeyOpt === "string" && validateNonEmptyString(apiKeyOpt)) {
						// --api-key <key>
						apiKey = apiKeyOpt;
					} else {
						// --api-key (no value) OR chosen from menu -> prompt for it, masked
						const answers = await inquirer.prompt<{ apiKey: string }>([
							{
								type: "password",
								name: "apiKey",
								message: "API key:",
								mask: "*",
								validate: (input: string) => {
									if (!validateNonEmptyString(input)) {
										return "API key cannot be empty";
									}
									return true;
								},
							},
						]);

						apiKey = answers.apiKey;
					}

					// Final validation just in case
					if (!validateNonEmptyString(apiKey!)) {
						spinner.fail("API key cannot be empty");
						process.exit(1);
					}

					spinner.start("Authenticating...");

					cfg.auth = { mode: "apikey", apiKey: apiKey! };
					await saveConfig(cfg);
					const client = makeClient(cfg);
					await client.users.me(); // verify key

					spinner.succeed("API key authenticated");
					console.log("Hello!");

					console.log(
						chalk.cyan(
							"Tip: API keys are the recommended way to authenticate the CLI because they are long-lived and easy to rotate.",
						),
					);
					return;
				}

				//
				// 2. EMAIL/PASSWORD LOGIN FLOW
				//
				console.log("Email/password mode selected");

				let email: string | undefined = typeof emailOpt === "string" ? emailOpt : undefined;

				if (!email || !password) {
					const answers = await inquirer.prompt<{
						email?: string;
						password?: string;
					}>([
						{
							type: "input",
							name: "email",
							message: "Email:",
							when: () => !email, // only ask if missing
							validate: (input: string) => {
								if (!validateNonEmptyString(input)) {
									return "Email cannot be empty";
								}
								if (!validateEmail(input)) {
									return "Please enter a valid email address";
								}
								return true;
							},
						},
						{
							type: "password",
							name: "password",
							message: "Password:",
							mask: "*",
							when: () => !password, // only ask if missing
							validate: (input: string) => {
								if (!validateNonEmptyString(input)) {
									return "Password cannot be empty";
								}
								return true;
							},
						},
					]);

					email = email || answers.email;
					password = password || answers.password;
				}

				// Final validation after prompts
				if (!email) {
					spinner.fail("Email is required");
					process.exit(1);
				}
				if (!password) {
					spinner.fail("Password is required");
					process.exit(1);
				}

				if (!validateEmail(email)) {
					spinner.fail("Invalid email address");
					process.exit(1);
				}
				if (!validateNonEmptyString(password)) {
					spinner.fail("Password cannot be empty");
					process.exit(1);
				}

				const loginCfg = {
					...cfg,
					auth: { mode: "email" as const },
				};

				const client = makeClient(loginCfg);

				spinner.start("Authenticating...");
				await client.auth.login(email, password);

				const authHeader = await client.auth.getAuthorizationHeader();

				const token = authHeader.replace(/^Bearer\s+/i, "");
				cfg.auth = { mode: "jwt", token };

				await saveConfig(cfg);

				let hasApiKeys = false;
				try {
					const keys = await client.keys.list();
					hasApiKeys = (keys.Count ?? keys.Keys?.length ?? 0) > 0;
				} catch {
					// if this fails, skip the suggestion; don't break login
				}

				spinner.succeed("Signed in");
				console.log("Hello!");

				if (!hasApiKeys) {
					console.log(
						chalk.yellow(
							[
								"",
								"Tip: You don't have any API keys yet.",
								"For long-lived CLI authentication, we recommend to create one:",
								"",
								'  signaloid-cli keys create --name "my-cli-key"',
								"  signaloid-cli auth login --api-key <created-key>",
								"",
							].join("\n"),
						),
					);
				} else {
					console.log(
						chalk.cyan(
							[
								"",
								"Tip: For long-lived CLI usage, we recommend to use an API key instead of email/password.",
								"You can log in with one of your existing keys using:",
								"",
								"  signaloid-cli auth login --api-key <your-key>",
								"",
							].join("\n"),
						),
					);
				}
			} catch (e: any) {
				spinner.fail("Authentication failed");
				console.log(chalk.red(e?.message || String(e)));
				process.exit(1);
			}
		});

	cmd.command("whoami")
		.description("Show current identity")
		.action(async () => {
			const spinner = ora("Checking session...").start();
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();
				spinner.succeed();
				console.log(JSON.stringify(me, null, 2));
			} catch (e: any) {
				spinner.fail("Not authenticated");
				await handleCliError(e);
			}
		});

	cmd.command("logout")
		.description("Clear local auth and sign out (if email)")
		.action(async () => {
			const spinner = ora("Logging out...").start();
			try {
				const cfg = await loadConfig();
				if (cfg.auth?.mode === "email") {
					const client = makeClient(cfg);
					await client.auth.logout();
				}
				cfg.auth = undefined;
				await saveConfig(cfg);
				spinner.succeed("Logged out locally");
			} catch (e: any) {
				spinner.fail("Logout failed");
				console.log(chalk.red(e?.message || String(e)));
				process.exit(1);
			}
		});
}
