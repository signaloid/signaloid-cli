import { Command } from "commander";
import inquirer from "inquirer";
import { createSpinner, createLazySpinner } from "../../utils/spinner";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { validateEmail, validateNonEmptyString } from "../../utils/validation";
import { errorMessageOf, handleCliError } from "../../utils/error-handler";
import { displayResource, OutputFormat } from "../../utils/output";
import { useGhStyleHelp, addLearnMore } from "../../utils/help-formatter";
import { printDebugError, printError, printInfo, printTip, printData } from "../../utils/verbosity";
import { EXIT_CODES } from "../../utils/exit-codes";

/**
 * Prompts need a terminal. Without one, inquirer cannot ask and the login would end as
 * "Cancelled." with exit 0, which a script cannot tell from success. Exit 2 instead.
 */
function requireInteractive(): void {
	if (!process.stdin.isTTY) {
		printError(
			"Cannot prompt without a terminal. Pass --api-key <key>, or --email <email> and --password <password>.",
		);
		process.exit(EXIT_CODES.USAGE);
	}
}

/**
 * Registers the 'auth' command and subcommands for authentication management.
 *
 * This command provides authentication functionality including login via API key
 * or email/password, checking current authentication status, and logging out.
 *
 * Available subcommands:
 * - login: Authenticate using API key or email/password credentials
 * - whoami: Display current authenticated user information
 * - logout: Clear the locally stored credentials
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
	const cmd = program.command("auth").description("Authenticate with Signaloid Cloud Compute Engine");
	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");

	cmd.command("login")
		.description("Login via API key or email/password")
		// Optional values so you can do: --api-key or --api-key <key>
		.option("--api-key [key]", "Signaloid API key")
		.option("--email [email]", "Email for password login")
		.option("--password <password>", "Password for password login")
		.action(async (opts) => {
			const cfg = await loadConfig();
			const spinner = createLazySpinner(); // start later, after prompts

			let apiKeyOpt = opts.apiKey as string | boolean | undefined;
			let emailOpt = opts.email as string | boolean | undefined;
			let password = opts.password as string | undefined;

			// Every prompt below needs a terminal. Check before the try, so that the exit is not
			// caught and turned into "Authentication failed" with another exit code.
			// No prompt only for --api-key <key>, or for --email <email> with --password.
			const canSkipPrompts =
				typeof apiKeyOpt === "string" ||
				(apiKeyOpt === undefined && typeof emailOpt === "string" && Boolean(password));
			if (!canSkipPrompts) requireInteractive();

			try {
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
					printInfo("API key mode selected");

					let apiKey: string | undefined;

					if (typeof apiKeyOpt === "string") {
						// --api-key <key>. An explicitly empty value (--api-key "") is a usage
						// error; only --api-key without a value (commander gives `true`) prompts.
						if (!validateNonEmptyString(apiKeyOpt)) {
							printError("API key cannot be empty");
							process.exit(EXIT_CODES.USAGE);
						}
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
						process.exit(EXIT_CODES.USAGE);
					}

					spinner.start("Authenticating...");

					// Verify the key before storing it, so a rejected key is never persisted.
					const candidateCfg = { ...cfg, auth: { mode: "apikey" as const, apiKey: apiKey! } };
					const client = makeClient(candidateCfg);
					await client.users.me(); // verify key
					await saveConfig(candidateCfg);

					spinner.succeed("API key authenticated");
					printInfo("Hello!");

					printTip(
						chalk.cyan(
							"Tip: API keys are the recommended way to authenticate the CLI because they are long-lived and easy to rotate.",
						),
					);
					return;
				}

				//
				// 2. EMAIL/PASSWORD LOGIN FLOW
				//
				printInfo("Email/password mode selected");

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
					process.exit(EXIT_CODES.USAGE);
				}
				if (!password) {
					spinner.fail("Password is required");
					process.exit(EXIT_CODES.USAGE);
				}

				if (!validateEmail(email)) {
					spinner.fail("Invalid email address");
					process.exit(EXIT_CODES.USAGE);
				}
				if (!validateNonEmptyString(password)) {
					spinner.fail("Password cannot be empty");
					process.exit(EXIT_CODES.USAGE);
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
					// One key is enough to know there are some.
					const keys = await client.keys.list({ limit: 1 });
					hasApiKeys = (keys.Count ?? keys.Keys?.length ?? 0) > 0;
				} catch {
					// if this fails, skip the suggestion; don't break login
				}

				spinner.succeed("Signed in");
				printInfo("Hello!");

				if (!hasApiKeys) {
					printTip(
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
					printTip(
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
				if (e?.name === "ExitPromptError") {
					spinner.stop();
					printInfo("\nCancelled.");
					return;
				}
				spinner.fail("Authentication failed");
				printError(chalk.red(errorMessageOf(e)));
				printDebugError(e);
				process.exit(EXIT_CODES.ERROR);
			}
		});

	cmd.command("whoami")
		.description("Show current identity")
		.option("--format <type>", "Output format: table|json", "json")
		.action(async (opts) => {
			const spinner = createSpinner("Checking session...");
			try {
				const client = makeClient(await loadConfig());
				const me = await client.users.me();
				spinner.succeed();
				const format = (opts.format || "json") as OutputFormat;
				if (format === "json") {
					printData(JSON.stringify(me, null, 2));
				} else {
					displayResource(me, "Current User");
				}
			} catch (e: any) {
				spinner.fail("Not authenticated");
				await handleCliError(e);
			}
		});

	// The CLI stores only an API key or an ID token, so it has no session it could end on
	// the server: the key stays valid, and the token until it expires.
	cmd.command("logout")
		.description("Clear the locally stored credentials")
		.action(async () => {
			const spinner = createSpinner("Logging out...");
			try {
				const cfg = await loadConfig();
				const mode = cfg.auth?.mode;
				cfg.auth = undefined;
				await saveConfig(cfg);
				spinner.succeed("Logged out locally");
				const tip = {
					apikey: "The API key itself stays valid. To revoke it, log in again and run: signaloid-cli keys delete --key-id <id>",
					jwt: "The session token stays valid until it expires. To end every session, log in again and run: signaloid-cli users logout-all --user-id <id>",
				}[mode as string];
				if (tip) printTip(chalk.cyan(tip));
			} catch (e: any) {
				spinner.fail("Logout failed");
				printError(chalk.red(errorMessageOf(e)));
				printDebugError(e);
				process.exit(EXIT_CODES.ERROR);
			}
		});
}
