import fs from "fs/promises";

/**
 * Updates the SIGNALOID_API_KEY in a given environment file.
 * If the key exists, its value is updated. If it doesn't exist, the key and value are added
 * to the environment object.
 *
 * @param filePath The absolute path to the environment file (e.g., environment.ts).
 * @param apiKey The new API key to set.
 */
export async function updateApiKeyInEnvFile(filePath: string, apiKey: string): Promise<void> {
	try {
		let content = await fs.readFile(filePath, "utf-8");

		// This regex finds an existing SIGNALOID_API_KEY and captures the parts around the value.
		const apiKeyRegex = /(SIGNALOID_API_KEY\s*:\s*['"])([^'"]*)(['"])/;

		if (apiKeyRegex.test(content)) {
			// If the key exists, we'll replace just the value part.
			content = content.replace(apiKeyRegex, `$1${apiKey}$3`);
		} else {
			// If the key doesn't exist, we'll add it before the closing brace of the object.
			const closingBraceIndex = content.lastIndexOf("}");
			if (closingBraceIndex === -1) {
				console.error(`Could not find closing brace in environment file: ${filePath}`);
				return;
			}

			// Check the character before the brace to see if we need to add a comma.
			const beforeBrace = content.substring(0, closingBraceIndex).trimEnd();
			const lastChar = beforeBrace.slice(-1);
			const needsComma = lastChar !== "{" && lastChar !== ",";

			// We'll add the new property with a preceding comma if needed.
			const newProperty = `${needsComma ? "," : ""}\n  SIGNALOID_API_KEY: '${apiKey}'`;

			// Insert the new property before the closing brace.
			content = content.slice(0, closingBraceIndex) + newProperty + `\n` + content.slice(closingBraceIndex);
		}

		await fs.writeFile(filePath, content, "utf-8");
	} catch (error: any) {
		if (error.code === "ENOENT") {
			console.warn(`Warning: Environment file not found at ${filePath}. Skipping update.`);
		} else {
			console.error(`Failed to update API key in ${filePath}:`, error);
			throw error; // Re-throw the error to be handled by the caller
		}
	}
}
