import { createClient } from "@signaloid/scce-sdk";
import type { AuthOptions } from "@signaloid/scce-sdk";
import type { CLIConfig } from "./config";

export function makeClient(cfg: CLIConfig) {
	let authOptions: AuthOptions;

	if (!cfg.auth) {
		throw new Error("Not authenticated. Run `signaloid-cli auth login` first.");
	}

	switch (cfg.auth.mode) {
		case "apikey": {
			if (!cfg.auth.apiKey) {
				throw new Error("No API key found in config. Run `signaloid-cli auth login --api-key ...`.");
			}
			authOptions = {
				method: "apiKey",
				key: cfg.auth.apiKey,
			};
			break;
		}

		case "jwt": {
			if (!cfg.auth.token) {
				throw new Error("No JWT token found in config. Please run `signaloid-cli auth login` again.");
			}
			authOptions = {
				method: "jwt",
				token: cfg.auth.token,
			};
			break;
		}

		case "email": {
			authOptions = {
				method: "email",
			};
			break;
		}

		default: {
			throw new Error(`Unknown auth mode: ${(cfg.auth as any).mode}`);
		}
	}

	return createClient(authOptions);
}
