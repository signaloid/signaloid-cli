jest.mock("@signaloid/scce-sdk", () => ({
	createClient: jest.fn().mockReturnValue({ users: {} }),
}));

import { createClient } from "@signaloid/scce-sdk";
import { makeClient } from "./sdk";

describe("utils/sdk makeClient", () => {
	it("creates an API-key client", () => {
		makeClient({ auth: { mode: "apikey", apiKey: "scce_key" } });
		expect(createClient).toHaveBeenCalledWith({ method: "apiKey", key: "scce_key" });
	});

	it.each([
		["no stored credentials", {}],
		["API-key mode without a key", { auth: { mode: "apikey" as const } }],
		["JWT mode without a token", { auth: { mode: "jwt" as const } }],
	])("%s throws an AUTH_NOT_LOGGED_IN error", (_name, cfg) => {
		expect(() => makeClient(cfg)).toThrow(expect.objectContaining({ code: "AUTH_NOT_LOGGED_IN" }));
	});
});
