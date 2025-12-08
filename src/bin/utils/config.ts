import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CLIConfig = {
	profile?: string;
	env?: "production";
	apiEndpoint?: string;
	websocketEndpoint?: string;
	auth?: { mode: "apikey" | "email" | "jwt"; apiKey?: string; email?: string; token?: string };
};

const baseDir =
	process.env.SIGNALOID_CONFIG_DIR ||
	(process.platform === "win32"
		? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "signaloid-cli")
		: process.platform === "darwin"
			? path.join(os.homedir(), "Library", "Application Support", "signaloid-cli")
			: path.join(os.homedir(), ".config", "signaloid-cli"));

const file = path.join(baseDir, "config.json");

export async function loadConfig(): Promise<CLIConfig> {
	try {
		return JSON.parse(await fs.readFile(file, "utf8"));
	} catch {
		await fs.mkdir(baseDir, { recursive: true });
		await fs.writeFile(file, "{}");
		return {};
	}
}
export async function saveConfig(cfg: CLIConfig) {
	await fs.mkdir(baseDir, { recursive: true });

	// Write config file with restricted permissions (0o600 = read/write for owner only)
	// This is important because the config file contains sensitive data like API keys
	await fs.writeFile(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });

	// On Unix-like systems, also ensure the config directory has appropriate permissions
	if (process.platform !== "win32") {
		try {
			await fs.chmod(baseDir, 0o700); // rwx------ (owner only)
		} catch (e) {
			// Ignore errors - this is a best-effort security measure
			// Some file systems may not support chmod
		}
	}
}
