import { createClient } from "@signaloid/scce-sdk";
import type { AuthOptions, ClientOptions } from "@signaloid/scce-sdk";
import type { CLIConfig } from "./config";

export function makeClient(cfg: CLIConfig) {
	const overrideEndpoints =
		cfg.env === "production"
			? { api: "https://api.signaloid.io", websocket: "wss://realtime.signaloid.io" }
			: cfg.env === "custom" && (cfg.apiEndpoint || cfg.websocketEndpoint)
				? {
						api: cfg.apiEndpoint ?? "https://api.signaloid.io",
						websocket: cfg.websocketEndpoint ?? "wss://realtime.signaloid.io",
					}
				: undefined;

	const authOptions: AuthOptions =
		cfg.auth?.mode === "apikey" && cfg.auth.apiKey
			? { method: "apiKey", key: cfg.auth.apiKey }
			: { method: "email" };

	const clientOptions: Partial<ClientOptions> | undefined = overrideEndpoints ? { overrideEndpoints } : undefined;

	return createClient(authOptions, clientOptions);
}
