import chalk from "chalk";
import { config } from "../../config/env.config";
import { printError } from "./verbosity";

export async function validateApiKey(apiKey: string): Promise<boolean> {
	const validationUrl = `${config.API_URL}/users/me`;
	try {
		const response = await fetch(validationUrl, {
			method: "GET",
			headers: {
				Authorization: `${apiKey}`,
				"Content-Type": "application/json",
			},
		});
		return response.ok;
	} catch (error) {
		printError(chalk.red("\nError: Could not connect to the API server. Please check your network connection."));
		return false;
	}
}
