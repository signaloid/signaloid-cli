import chalk from "chalk";
import { config } from "../../config/env.config";

/**
 * Validates a Signaloid API key by making a lightweight request to the API.
 * @param apiKey The API key to validate.
 * @returns A promise that resolves to true if the key is valid, false otherwise.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
	const validationUrl = `${config.API_URL}/users/me`;
	try {
		const response = await fetch(validationUrl, {
			method: "GET",
			headers: {
				// The standard way to send a key is via the Authorization header.
				Authorization: `${apiKey}`,
				"Content-Type": "application/json",
			},
		});
		// A 200-299 status code means the request was successful and the key is valid.
		return response.ok;
	} catch (error) {
		// This catches network errors (e.g., no internet, DNS failure).
		console.error(chalk.red("\nError: Could not connect to the API server. Please check your network connection."));
		return false;
	}
}
