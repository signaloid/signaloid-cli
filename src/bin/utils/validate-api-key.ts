import chalk from "chalk";
import { httpStatusOf } from "./error-handler";
import { makeClient } from "./sdk";
import { printError } from "./verbosity";

/**
 * Checks an API key by calling GET /users/me with it.
 *
 * The request goes through the SDK client, so it targets the same API endpoint
 * as every other command (including an API_ENDPOINT override).
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
	try {
		const client = makeClient({ auth: { mode: "apikey", apiKey } });
		await client.users.me();
		return true;
	} catch (error: any) {
		// The API answered (e.g., 401 or 403), so the key is not valid.
		if (httpStatusOf(error) !== undefined) {
			return false;
		}
		printError(chalk.red("\nError: Could not connect to the API server. Please check your network connection."));
		return false;
	}
}
