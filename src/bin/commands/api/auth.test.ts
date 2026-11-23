import auth from "./auth";
import { Command } from "commander";
import { loadConfig, saveConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import inquirer from "inquirer";
import { API_KEYS_URL } from "../../utils/error-handler";

// Mock dependencies
jest.mock("../../utils/config");
jest.mock("../../utils/sdk");
jest.mock("ora", () => {
	return jest.fn(() => ({
		start: jest.fn().mockReturnThis(),
		stop: jest.fn().mockReturnThis(),
		succeed: jest.fn().mockReturnThis(),
		fail: jest.fn().mockReturnThis(),
	}));
});
jest.mock("inquirer");
jest.mock("chalk", () => ({
	red: jest.fn((str) => str),
	cyan: jest.fn((str) => str),
	yellow: jest.fn((str) => str),
	bold: jest.fn((str) => str),
	dim: jest.fn((str) => str),
	underline: jest.fn((str) => str),
	default: {
		red: jest.fn((str) => str),
		cyan: jest.fn((str) => str),
		yellow: jest.fn((str) => str),
		bold: jest.fn((str) => str),
		dim: jest.fn((str) => str),
		underline: jest.fn((str) => str),
	},
}));

describe("auth commands", () => {
	let program: Command;
	let mockClient: any;
	const origIsTTY = process.stdin.isTTY;

	beforeEach(() => {
		jest.clearAllMocks();

		// Create a new Command instance for each test
		program = new Command();

		// Mock console methods
		jest.spyOn(console, "log").mockImplementation();
		jest.spyOn(console, "error").mockImplementation();

		// Mock process.exit
		jest.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined) => {
			throw new Error(`Process exited with code ${code}`);
		});

		// Setup mock client
		mockClient = {
			users: {
				me: jest.fn().mockResolvedValue({
					id: "user-123",
					name: "Test User",
					email: "test@example.com",
				}),
			},
			auth: {
				login: jest.fn().mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } }),
				confirmNewPassword: jest.fn().mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } }),
				getAuthorizationHeader: jest.fn().mockResolvedValue("Bearer jwt-token"),
				logout: jest.fn().mockResolvedValue({}),
			},
			keys: {
				list: jest.fn().mockResolvedValue({ Count: 1 }),
			},
		};

		(makeClient as jest.Mock).mockReturnValue(mockClient);
		(loadConfig as jest.Mock).mockResolvedValue({});
		(saveConfig as jest.Mock).mockResolvedValue(undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		(process.stdin as any).isTTY = origIsTTY;
	});

	describe("login command", () => {
		beforeEach(() => {
			auth(program);
		});

		it("should register auth login command", () => {
			const command = program.commands.find((cmd) => cmd.name() === "auth");
			expect(command).toBeDefined();

			const loginCmd = command?.commands.find((cmd) => cmd.name() === "login");
			expect(loginCmd).toBeDefined();
			expect(loginCmd?.description()).toBe("Login via API key or email/password");
		});

		it("should have correct options", () => {
			const authCmd = program.commands.find((cmd) => cmd.name() === "auth");
			const loginCmd = authCmd?.commands.find((cmd) => cmd.name() === "login");

			const options = loginCmd?.options || [];
			const optionNames = options.map((opt) => opt.long);

			expect(optionNames).toContain("--api-key");
			expect(optionNames).toContain("--email");
			expect(optionNames).toContain("--password");
		});

		it("verifies the API key before saving it", async () => {
			await program.parseAsync(["node", "x", "auth", "login", "--api-key", "scce_good"]);
			expect(makeClient).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: "scce_good" } });
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: "scce_good" } });
			expect(mockClient.users.me.mock.invocationCallOrder[0]).toBeLessThan(
				(saveConfig as jest.Mock).mock.invocationCallOrder[0],
			);
		});

		it("does not save a rejected API key", async () => {
			mockClient.users.me.mockRejectedValueOnce(new Error("Unauthorized"));
			await expect(program.parseAsync(["node", "x", "auth", "login", "--api-key", "scce_bad"])).rejects.toThrow(
				"Process exited with code 1",
			);
			expect(saveConfig).not.toHaveBeenCalled();
		});

		it('rejects --api-key "" as a usage error without prompting', async () => {
			await expect(program.parseAsync(["node", "x", "auth", "login", "--api-key", ""])).rejects.toThrow(
				/Process exited with code/,
			);
			expect(process.exit).toHaveBeenCalledWith(2);
			expect(inquirer.prompt).not.toHaveBeenCalled();
			expect(saveConfig).not.toHaveBeenCalled();
		});

		it("prompts for the key when --api-key has no value", async () => {
			(process.stdin as any).isTTY = true;
			(inquirer.prompt as unknown as jest.Mock).mockResolvedValueOnce({ apiKey: "scce_prompted" });
			await program.parseAsync(["node", "x", "auth", "login", "--api-key"]);
			expect(inquirer.prompt).toHaveBeenCalledTimes(1);
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: "scce_prompted" } });
		});
	});

	describe("login without a terminal", () => {
		beforeEach(() => {
			auth(program);
			(process.stdin as any).isTTY = false;
		});

		it.each([[[]], [["--api-key"]], [["--email", "user@example.com"]], [["--password", "p"]]])(
			"exits 2 instead of prompting (args %j)",
			async (args) => {
				await expect(program.parseAsync(["node", "x", "auth", "login", ...args])).rejects.toThrow(
					/Process exited with code/,
				);
				// Exactly one exit: a second one from the catch block would replace the code 2.
				expect(process.exit).toHaveBeenCalledTimes(1);
				expect(process.exit).toHaveBeenCalledWith(2);
				expect(inquirer.prompt).not.toHaveBeenCalled();
				expect(saveConfig).not.toHaveBeenCalled();
			},
		);

		it("still logs in with --api-key <key>", async () => {
			await program.parseAsync(["node", "x", "auth", "login", "--api-key", "scce_good"]);
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: "scce_good" } });
		});
	});

	describe("email/password sign-in", () => {
		const emailLogin = ["node", "x", "auth", "login", "--email", "user@example.com", "--password", "temp-pass"];

		beforeEach(() => {
			auth(program);
			(process.stdin as any).isTTY = true;
		});

		it("saves the session token when sign-in completes", async () => {
			await program.parseAsync(emailLogin);
			expect(mockClient.auth.login).toHaveBeenCalledWith("user@example.com", "temp-pass");
			expect(mockClient.auth.confirmNewPassword).not.toHaveBeenCalled();
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "jwt", token: "jwt-token" } });
		});

		it("prompts for a new password when the account has a temporary one", async () => {
			mockClient.auth.login.mockResolvedValueOnce({
				isSignedIn: false,
				nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
			});
			(inquirer.prompt as unknown as jest.Mock).mockResolvedValueOnce({
				newPassword: "new-pass",
				confirmPassword: "new-pass",
			});
			await program.parseAsync(emailLogin);
			expect(mockClient.auth.confirmNewPassword).toHaveBeenCalledWith("new-pass");
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "jwt", token: "jwt-token" } });
		});

		it("exits 2 without prompting when a new password is needed and there is no terminal", async () => {
			(process.stdin as any).isTTY = false;
			mockClient.auth.login.mockResolvedValueOnce({
				isSignedIn: false,
				nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
			});
			await expect(program.parseAsync(emailLogin)).rejects.toThrow(/Process exited with code/);
			expect(process.exit).toHaveBeenNthCalledWith(1, 2);
			expect(inquirer.prompt).not.toHaveBeenCalled();
			expect(saveConfig).not.toHaveBeenCalled();
		});

		it.each(["AUTH_INCORRECT_CREDENTIALS", "AUTH_USER_NOT_FOUND"])(
			"points a Google account to the API keys page when sign-in fails with %s",
			async (code) => {
				mockClient.auth.login.mockRejectedValueOnce({ name: "SdkError", code, message: "Sign-in failed" });
				await expect(program.parseAsync(emailLogin)).rejects.toThrow(/Process exited with code/);
				const printed = (console.error as jest.Mock).mock.calls.flat().join("\n");
				expect(printed).toContain("sign in to Signaloid with Google");
				expect(printed).toContain(API_KEYS_URL);
			},
		);

		it("does not mention Google when sign-in fails for another reason", async () => {
			mockClient.auth.login.mockRejectedValueOnce({
				name: "SdkError",
				code: "API_NETWORK_ERROR",
				message: "Network error",
			});
			await expect(program.parseAsync(emailLogin)).rejects.toThrow(/Process exited with code/);
			const printed = (console.error as jest.Mock).mock.calls.flat().join("\n");
			expect(printed).not.toContain("Google");
		});

		it("exits 3 without saving when sign-in needs a step the CLI does not support", async () => {
			mockClient.auth.login.mockResolvedValueOnce({
				isSignedIn: false,
				nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_TOTP_CODE" },
			});
			await expect(program.parseAsync(emailLogin)).rejects.toThrow(/Process exited with code/);
			expect(process.exit).toHaveBeenNthCalledWith(1, 3);
			expect(mockClient.auth.getAuthorizationHeader).not.toHaveBeenCalled();
			expect(saveConfig).not.toHaveBeenCalled();
		});
	});

	describe("logout", () => {
		beforeEach(() => {
			auth(program);
		});

		it.each(["jwt", "email", "apikey"])("clears %s credentials without calling the SDK logout", async (mode) => {
			(loadConfig as jest.Mock).mockResolvedValue({ auth: { mode, token: "t", apiKey: "k" } });
			await program.parseAsync(["node", "x", "auth", "logout"]);
			expect(saveConfig).toHaveBeenCalledWith({ auth: undefined });
			expect(mockClient.auth.logout).not.toHaveBeenCalled();
		});
	});

	describe("whoami command", () => {
		beforeEach(() => {
			auth(program);
		});

		it("should register whoami command", () => {
			const authCmd = program.commands.find((cmd) => cmd.name() === "auth");
			const whoamiCmd = authCmd?.commands.find((cmd) => cmd.name() === "whoami");

			expect(whoamiCmd).toBeDefined();
			expect(whoamiCmd?.description()).toBe("Show current identity");
		});
	});

	describe("logout command", () => {
		beforeEach(() => {
			auth(program);
		});

		it("should register logout command", () => {
			const authCmd = program.commands.find((cmd) => cmd.name() === "auth");
			const logoutCmd = authCmd?.commands.find((cmd) => cmd.name() === "logout");

			expect(logoutCmd).toBeDefined();
			expect(logoutCmd?.description()).toBe("Clear the locally stored credentials");
		});
	});
});
