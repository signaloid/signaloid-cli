import { createSpinner, Spinner } from "./spinner";
import chalk from "chalk";
import { loadConfig } from "./config";
import { printDebugError, printError, printTip } from "./verbosity";
import { EXIT_CODES } from "./exit-codes";
import { errorCodeOf, httpStatusOf } from "./http-error";

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
	const spinner = createSpinner(spinnerText);
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
		printError(e?.message || String(e));
		process.exit(EXIT_CODES.ERROR);
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
	onSuccess: (result: T, spinner: Spinner) => void,
): Promise<T> {
	const spinner = createSpinner(spinnerText);
	try {
		const result = await fn();
		onSuccess(result, spinner);
		return result;
	} catch (e: any) {
		spinner.fail(failMessage);
		printError(e?.message || String(e));
		process.exit(EXIT_CODES.ERROR);
	}
}

/**
 * Some API errors carry a JSON string as their message, such as
 * `{"error":"You cannot perform this action"}`. Returns the inner message for those,
 * and the message unchanged otherwise.
 */
function unwrapErrorMessage(msg: string): string {
	const trimmed = msg.trim();
	if (!trimmed.startsWith("{")) return msg;
	try {
		const inner = JSON.parse(trimmed);
		const text = inner?.error ?? inner?.message;
		return typeof text === "string" && text ? text : msg;
	} catch {
		return msg;
	}
}

/** The message axios gives every HTTP error, which says nothing the status does not. */
const GENERIC_HTTP_MESSAGE = /^Request failed with status code \d+$/;

const nonEmpty = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * The most useful message an error carries. The SDK sets `message` to the response body's
 * `message`, or else to the generic axios message, and keeps the body in `details` and its
 * `error` in `errorType`. So the body's `message` or `error` is preferred to the generic text.
 */
// TODO: the SDK could fall back to `errorType` itself (`body.message || errorType || err.message` in
// SignaloidClient's error sanitizer). Drop the GENERIC_HTTP_MESSAGE check once a release does that.
export function errorMessageOf(e: any): string {
	const own = nonEmpty(e?.message);
	const details = e?.details;
	const text =
		(own && !GENERIC_HTTP_MESSAGE.test(own.trim()) ? own : undefined) ??
		nonEmpty(details) ??
		nonEmpty(details?.message) ??
		nonEmpty(details?.error) ??
		nonEmpty(e?.errorType) ??
		own;
	return text ? unwrapErrorMessage(text) : "An error occurred";
}

export async function handleCliError(e: any, context?: string): Promise<never> {
	const code = errorCodeOf(e);

	const status = httpStatusOf(e);

	const msg = errorMessageOf(e);

	const isAuthError =
		code === "AUTH_EXPIRED_TOKEN" ||
		code === "AUTH_INVALID_TOKEN" ||
		code === "AUTH_MISSING_TOKEN" ||
		code === "AUTH_NOT_LOGGED_IN" ||
		code === "API_UNAUTHORIZED" ||
		status === 401 ||
		msg === "Unauthorized";

	printDebugError(e);

	if (isAuthError) {
		let cfg: any = null;
		try {
			cfg = await loadConfig();
		} catch {
			// ignore; might fail before config exists
		}
		const mode = cfg?.auth?.mode;

		printError(chalk.red(msg));

		if (mode === "jwt") {
			printTip(
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
			printTip(
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
			printTip(
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

		process.exit(EXIT_CODES.AUTH);
	}

	// ---- NON-AUTH ERRORS ----
	if (context) {
		printError(chalk.red(`${context} failed.`));
	}

	printError(msg);

	// A 403 means valid credentials that are not allowed to do this, so it exits 3 like
	// other auth failures, but without a login tip.
	const forbidden = status === 403 || code === "API_FORBIDDEN";
	process.exit(forbidden ? EXIT_CODES.AUTH : status === 404 ? EXIT_CODES.NOT_FOUND : EXIT_CODES.ERROR);
}
