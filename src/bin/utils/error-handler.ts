import ora, { Ora } from "ora";
import chalk from "chalk";
import { loadConfig } from "./config";

/**
 * Wraps an async function with consistent error handling and spinner management.
 * Automatically handles errors, stops the spinner, and exits the process on failure.
 *
 * @param spinnerText - Text to display while operation is in progress
 * @param successMessage - Message to display on success (optional - defaults to stopping without message)
 * @param failMessage - Message to display on failure
 * @param fn - The async function to execute
 * @returns The result of the async function
 */
export async function withErrorHandling<T>(
	spinnerText: string,
	successMessage: string | undefined,
	failMessage: string,
	fn: () => Promise<T>,
): Promise<T> {
	const spinner = ora(spinnerText).start();
	try {
		const result = await fn();
		if (successMessage) {
			spinner.succeed(successMessage);
		} else {
			spinner.succeed();
		}
		return result;
	} catch (e: any) {
		spinner.fail(failMessage);
		console.error(e?.message || String(e));
		process.exit(1);
	}
}

/**
 * Similar to withErrorHandling but allows custom success handling
 * that receives both the result and the spinner.
 */
export async function withErrorHandlingCustom<T>(
	spinnerText: string,
	failMessage: string,
	fn: () => Promise<T>,
	onSuccess: (result: T, spinner: Ora) => void,
): Promise<T> {
	const spinner = ora(spinnerText).start();
	try {
		const result = await fn();
		onSuccess(result, spinner);
		return result;
	} catch (e: any) {
		spinner.fail(failMessage);
		console.error(e?.message || String(e));
		process.exit(1);
	}
}

export async function handleCliError(e: any, context?: string): Promise<never> {
	let cfg: any = null;
	try {
		cfg = await loadConfig();
	} catch {
		// ignore; might fail before config exists
	}

	const code = e.code ?? e.details?.code;

	const status = e.response?.status ?? e.details?.response?.status;

	const msg = e.message || e.details || e.details?.message || "An error occurred";

	const isAuthError =
		code === "AUTH_EXPIRED_TOKEN" ||
		code === "AUTH_INVALID_TOKEN" ||
		code === "AUTH_MISSING_TOKEN" ||
		code === "AUTH_NOT_LOGGED_IN" ||
		code === "API_UNAUTHORIZED" ||
		status === 401 ||
		msg === "Unauthorized";

	if (isAuthError) {
		const mode = cfg?.auth?.mode;

		console.error(chalk.red(msg));

		if (mode === "jwt") {
			console.error(
				chalk.yellow(
					[
						"",
						"Your CLI session has expired or is no longer valid.",
						"Please sign in again using:",
						"",
						"  signaloid-cli auth login --email <your-email> --password <your-password>",
						"",
					].join("\n"),
				),
			);
		} else if (mode === "apikey") {
			console.error(
				chalk.yellow(
					[
						"",
						"Your API key appears to be invalid or expired.",
						"You can create a new key with:",
						"",
						'  signaloid-cli keys create --name "my-cli-key"',
						"  signaloid-cli auth login --api-key <created-key>",
						"",
					].join("\n"),
				),
			);
		} else {
			console.error(
				chalk.yellow(
					[
						"",
						"You are not authenticated. Please log in:",
						"",
						"  signaloid-cli auth login --api-key <your-key>",
						"  # or",
						"  signaloid-cli auth login --email <your-email> --password <your-password>",
						"",
					].join("\n"),
				),
			);
		}

		process.exit(1);
	}

	// ---- NON-AUTH ERRORS ----
	if (context) {
		console.error(chalk.red(`${context} failed.`));
	}

	console.error(msg);
	process.exit(1);
}
