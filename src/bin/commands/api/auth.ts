import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import { validateEmail, validateNonEmptyString } from "../../utils/validation";

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
		.option("--api-key <key>", "Signaloid API key")
		.option("--email <email>", "Email for password login")
		.option("--password <password>", "Password for password login")
		.action(async (opts) => {
			const cfg = await loadConfig();
			const spinner = ora("Authenticating...").start();
			try {
				if (!opts.apiKey && (!opts.email || !opts.password)) {
					spinner.fail("Either --api-key or both --email and --password are required");
					process.exit(1);
				}
				if (opts.apiKey) {
					// Validate API key is not empty
					if (!validateNonEmptyString(opts.apiKey)) {
						spinner.fail("API key cannot be empty");
						process.exit(1);
					}

					cfg.auth = { mode: "apikey", apiKey: opts.apiKey };
					await saveConfig(cfg);
					const client = makeClient(cfg);
					const me = await client.users.me();
					spinner.succeed("API key authenticated");
					if (me.name || me.email || me.id) {
						console.log(`Hello, ${me.name || me.email || me.id}`);
					} else {
						console.log("Hello!");
					}
					return;
				}

				let { email, password } = opts;
				if (!email || !password) {
					const a = await inquirer.prompt([
						{
							type: "input",
							name: "email",
							message: "Email:",
							when: !email,
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
							when: !password,
							mask: "*",
							validate: (input: string) => {
								if (!validateNonEmptyString(input)) {
									return "Password cannot be empty";
								}
								return true;
							},
						},
					]);
					email = email || a.email;
					password = password || a.password;
				}

				// Validate email and password from command-line options
				if (email && !validateEmail(email)) {
					spinner.fail("Invalid email address");
					process.exit(1);
				}
				if (password && !validateNonEmptyString(password)) {
					spinner.fail("Password cannot be empty");
					process.exit(1);
				}

				const client = makeClient(cfg);
				await client.auth.login(email!, password!);
				cfg.auth = { mode: "email", email };
				await saveConfig(cfg);
				const me = await client.users.me();
				spinner.succeed("Signed in");
				console.log(`Hello, ${me.name || me.email || me.id}`);
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
				console.log(chalk.red(e?.message || String(e)));
				process.exit(1);
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
