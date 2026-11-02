import auth from "./auth";
import { Command } from "commander";
import { loadConfig, saveConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";
import inquirer from "inquirer";

// Mock dependencies
jest.mock("../../utils/config");
jest.mock("../../utils/sdk");
jest.mock("ora", () => {
	return jest.fn(() => ({
		start: jest.fn().mockReturnThis(),
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
				login: jest.fn().mockResolvedValue({}),
				logout: jest.fn().mockResolvedValue({}),
			},
		};

		(makeClient as jest.Mock).mockReturnValue(mockClient);
		(loadConfig as jest.Mock).mockResolvedValue({});
		(saveConfig as jest.Mock).mockResolvedValue(undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
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
			(inquirer.prompt as unknown as jest.Mock).mockResolvedValueOnce({ apiKey: "scce_prompted" });
			await program.parseAsync(["node", "x", "auth", "login", "--api-key"]);
			expect(inquirer.prompt).toHaveBeenCalledTimes(1);
			expect(saveConfig).toHaveBeenCalledWith({ auth: { mode: "apikey", apiKey: "scce_prompted" } });
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
			expect(logoutCmd?.description()).toBe("Clear local auth and sign out (if email)");
		});
	});
});
