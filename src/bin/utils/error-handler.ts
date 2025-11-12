import ora, { Ora } from "ora";

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
