import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CLIConfig = {
	profile?: string;
	env?: "production" | "custom";
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
		// The file will hold credentials, so create it owner-only, like a saved config.
		await saveConfig({});
		return {};
	}
}
export async function saveConfig(cfg: CLIConfig) {
	await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });

	// Write config file with restricted permissions (0o600 = read/write for owner only)
	// This is important because the config file contains sensitive data like API keys
	await fs.writeFile(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });

	// The write applies `mode` only when it creates the file, so tighten an existing
	// file (e.g., one created with the default permissions) and the directory explicitly.
	// Best effort: some file systems do not support chmod.
	if (process.platform !== "win32") {
		for (const [target, mode] of [
			[file, 0o600],
			[baseDir, 0o700],
		] as const) {
			await fs.chmod(target, mode).catch(() => {});
		}
	}
}
