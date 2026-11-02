import { Command } from "commander";

jest.mock("../../utils/config", () => ({
	loadConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("ora", () => ({
	__esModule: true,
	default: () => ({
		start: () => ({ succeed: () => ({}) as any, fail: () => ({}) as any }),
		succeed: () => ({}) as any,
		fail: () => ({}) as any,
	}),
}));

jest.mock("../../utils/sdk", () => {
	const keys = {
		list: jest.fn().mockResolvedValue({ Keys: [{ KeyID: "k1", Name: "MyKey" }] }),
		create: jest.fn().mockResolvedValue({ KeyID: "k2" }),
		delete: jest.fn().mockResolvedValue({ deleted: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ keys }),
		mockKeysAPI: keys,
	};
});

jest.mock("inquirer", () => ({
	__esModule: true,
	default: {
		prompt: jest.fn(),
		Separator: class Separator {},
	},
}));

import keysCmd, { keyIdFromApiKey } from "./keys";
const { mockKeysAPI, makeClient } = jest.requireMock("../../utils/sdk");
const { default: mockInquirer } = jest.requireMock("inquirer") as { default: { prompt: jest.Mock } };

jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
let exitCode: number | undefined;
jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
	exitCode = code as number;
	throw new Error("EXIT");
}) as any);

const makeProgram = () => {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({ writeOut() {}, writeErr() {} });
	keysCmd(program);
	return program;
};

describe("keys CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
		process.exitCode = undefined;
	});

	afterAll(() => {
		process.exitCode = undefined;
	});

	it("list", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "list"]);
		expect(mockKeysAPI.list).toHaveBeenCalled();
	});

	it("create without valid-until", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "create", "--name", "MyKey"]);
		expect(mockKeysAPI.create).toHaveBeenCalledWith({ Name: "MyKey", ValidUntil: null });
	});

	it("create with valid-until", async () => {
		const iso = "2030-12-31T23:59:59Z";
		// Keys ValidUntil is epoch seconds, not milliseconds.
		const timestampSeconds = Math.floor(new Date(iso).getTime() / 1000);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "create", "--name", "Future", "--valid-until", iso]);
		expect(mockKeysAPI.create).toHaveBeenCalledWith({ Name: "Future", ValidUntil: timestampSeconds });
	});

	it("create fails with invalid date", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "keys", "create", "--name", "Invalid", "--valid-until", "bad-date"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete", "--key-id", "k1"]);
		expect(mockKeysAPI.delete).toHaveBeenCalledWith("k1");
	});

	it("delete fails on error", async () => {
		mockKeysAPI.delete.mockRejectedValueOnce(new Error("network"));
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "keys", "delete", "--key-id", "k9"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	// Real key layout: scce_<KeyID: 32 hex><payload: 32 hex>_<CRC32 hex>
	const keyID = "0123456789abcdef0123456789abcdef";
	const fullKey = `scce_${keyID}${"f".repeat(32)}_1a2b3c4d`;

	it.each([
		["a full key", fullKey, keyID],
		["a short (unpadded) checksum", `scce_${keyID}${"f".repeat(32)}_abc`, keyID],
		["a too-short key", "scce_k1", undefined],
		["a key without the scce_ prefix", `${keyID}${"f".repeat(32)}_1a2b3c4d`, undefined],
		["a key without a checksum", `scce_${keyID}${"f".repeat(32)}`, undefined],
	])("keyIdFromApiKey handles %s", (_label, input, expected) => {
		expect(keyIdFromApiKey(input)).toBe(expected);
	});

	it("delete with --api-key deletes the KeyID part of the key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete", "--api-key", fullKey]);
		expect(mockKeysAPI.delete).toHaveBeenCalledWith(keyID);
	});

	it("delete with a malformed --api-key is a usage error", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete", "--api-key", "scce_k1"]);
		expect(mockKeysAPI.delete).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(2);
	});

	it("delete without stored credentials exits with the auth code", async () => {
		const err = jest.requireActual("../../utils/sdk").notLoggedInError("Not authenticated.");
		makeClient.mockImplementationOnce(() => {
			throw err;
		});
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "keys", "delete", "--key-id", "k1"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(3);
		expect(mockKeysAPI.delete).not.toHaveBeenCalled();
	});

	it("validate checks the key through the SDK client", async () => {
		const me = jest.fn().mockResolvedValue({ UserID: "u1" });
		makeClient.mockReturnValueOnce({ users: { me } });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "validate", "--api-key", fullKey]);
		expect(makeClient).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: fullKey } });
		expect(me).toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it("validate reports a key the API rejects", async () => {
		const me = jest.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
		makeClient.mockReturnValueOnce({ users: { me } });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "validate", "--api-key", "scce_bad"]);
		expect(process.exitCode).toBe(1);
	});

	it("delete interactive: selects and deletes a key", async () => {
		mockInquirer.prompt.mockResolvedValueOnce({ selectedKeyId: "k1" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete"]);
		expect(mockKeysAPI.list).toHaveBeenCalled();
		expect(mockKeysAPI.delete).toHaveBeenCalledWith("k1");
	});

	it("delete interactive: cancel option skips deletion", async () => {
		mockInquirer.prompt.mockResolvedValueOnce({ selectedKeyId: "__cancel__" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete"]);
		expect(mockKeysAPI.delete).not.toHaveBeenCalled();
	});

	it("delete interactive: ExitPromptError cancels gracefully", async () => {
		const err = new Error("force closed") as any;
		err.name = "ExitPromptError";
		mockInquirer.prompt.mockRejectedValueOnce(err);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete"]);
		expect(mockKeysAPI.delete).not.toHaveBeenCalled();
	});

	it("delete with both --key-id and --api-key exits with usage error", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "keys", "delete", "--key-id", "k1", "--api-key", "scce_k1"]);
		expect(mockKeysAPI.delete).not.toHaveBeenCalled();
		// Conflicting flags are a usage error, exit 2.
		expect(process.exitCode).toBe(2);
	});
});
