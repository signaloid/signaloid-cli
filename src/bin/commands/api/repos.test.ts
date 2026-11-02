import repos from "./repos";
import { Command } from "commander";

// Mock dependencies
jest.mock("../../utils/config");
jest.mock("../../utils/sdk");
jest.mock("../../utils/validation");
jest.mock("ora", () => {
	return jest.fn(() => ({
		start: jest.fn().mockReturnThis(),
		succeed: jest.fn().mockReturnThis(),
		fail: jest.fn().mockReturnThis(),
	}));
});

describe("repos commands", () => {
	let program: Command;

	beforeEach(() => {
		jest.clearAllMocks();
		program = new Command();

		// Mock console methods
		jest.spyOn(console, "log").mockImplementation();
		jest.spyOn(console, "error").mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("command registration", () => {
		beforeEach(() => {
			repos(program);
		});

		it("should register repos command", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			expect(reposCmd).toBeDefined();
			expect(reposCmd?.description()).toBe("Connect and manage code repositories");
		});

		it("should register list subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const listCmd = reposCmd?.commands.find((cmd) => cmd.name() === "list");

			expect(listCmd).toBeDefined();
			expect(listCmd?.description()).toBe("List repositories");
		});

		it("should register get subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const getCmd = reposCmd?.commands.find((cmd) => cmd.name() === "get");

			expect(getCmd).toBeDefined();
			expect(getCmd?.description()).toBe("Get a repository by ID");
		});

		it("should register connect subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			expect(connectCmd).toBeDefined();
			expect(connectCmd?.description()).toBe("Connect a repository");
		});

		it("should register update subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const updateCmd = reposCmd?.commands.find((cmd) => cmd.name() === "update");

			expect(updateCmd).toBeDefined();
			expect(updateCmd?.description()).toBe("Update repository metadata");
		});

		it("should register disconnect subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const disconnectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "disconnect");

			expect(disconnectCmd).toBeDefined();
			expect(disconnectCmd?.description()).toBe("Disconnect a repository");
		});

		it("should register builds subcommand", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const buildsCmd = reposCmd?.commands.find((cmd) => cmd.name() === "builds");

			expect(buildsCmd).toBeDefined();
			expect(buildsCmd?.description()).toBe("List builds for a repository");
		});
	});

	describe("connect command options", () => {
		beforeEach(() => {
			repos(program);
		});

		it("should have required --url option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const urlOption = connectCmd?.options.find((opt) => opt.long === "--url");
			expect(urlOption).toBeDefined();
			expect(urlOption?.required).toBe(true);
		});

		it("should have optional --commit option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const commitOption = connectCmd?.options.find((opt) => opt.long === "--commit");
			expect(commitOption).toBeDefined();
			expect(commitOption?.mandatory).toBeFalsy();
		});

		it("should have optional --branch option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const branchOption = connectCmd?.options.find((opt) => opt.long === "--branch");
			expect(branchOption).toBeDefined();
			expect(branchOption?.mandatory).toBeFalsy();
		});

		it("should have optional --dir option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const dirOption = connectCmd?.options.find((opt) => opt.long === "--dir");
			expect(dirOption).toBeDefined();
			expect(dirOption?.mandatory).toBeFalsy();
		});

		it("should have optional --args option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const argsOption = connectCmd?.options.find((opt) => opt.long === "--args");
			expect(argsOption).toBeDefined();
			expect(argsOption?.mandatory).toBeFalsy();
		});

		it("should have optional --core-id option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const connectCmd = reposCmd?.commands.find((cmd) => cmd.name() === "connect");

			const coreOption = connectCmd?.options.find((opt) => opt.long === "--core-id");
			expect(coreOption).toBeDefined();
			expect(coreOption?.mandatory).toBeFalsy();
		});
	});

	describe("get command options", () => {
		beforeEach(() => {
			repos(program);
		});

		it("should have required --repo-id option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const getCmd = reposCmd?.commands.find((cmd) => cmd.name() === "get");

			const repoIdOption = getCmd?.options.find((opt) => opt.long === "--repo-id");
			expect(repoIdOption).toBeDefined();
			expect(repoIdOption?.required).toBe(true);
		});
	});

	describe("update command options", () => {
		beforeEach(() => {
			repos(program);
		});

		it("should have required --repo-id option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const updateCmd = reposCmd?.commands.find((cmd) => cmd.name() === "update");

			const repoIdOption = updateCmd?.options.find((opt) => opt.long === "--repo-id");
			expect(repoIdOption).toBeDefined();
			expect(repoIdOption?.required).toBe(true);
		});

		it("should have optional update fields", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const updateCmd = reposCmd?.commands.find((cmd) => cmd.name() === "update");

			const optionNames = updateCmd?.options.map((opt) => opt.long) || [];

			expect(optionNames).toContain("--commit");
			expect(optionNames).toContain("--branch");
			expect(optionNames).toContain("--dir");
			expect(optionNames).toContain("--args");
			expect(optionNames).toContain("--core-id");
		});
	});

	describe("list --format json output", () => {
		it("outputs a wrapped object with Repositories key", async () => {
			const { makeClient } = jest.requireMock("../../utils/sdk");
			makeClient.mockReturnValue({
				repositories: {
					list: jest.fn().mockResolvedValue({ Repositories: [{ RepositoryID: "r1" }, { RepositoryID: "r2" }] }),
				},
			});
			const { loadConfig } = jest.requireMock("../../utils/config");
			loadConfig.mockResolvedValue({});

			const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
			repos(program);
			program.exitOverride();
			program.configureOutput({ writeOut() {}, writeErr() {} });
			await program.parseAsync(["node", "x", "repos", "list", "--format", "json"]);

			const out = JSON.parse(logSpy.mock.calls[0][0]);
			expect(Array.isArray(out)).toBe(false);
			expect(out).toHaveProperty("Repositories");
			expect(out.Repositories).toHaveLength(2);
			expect(out.Repositories[0]).toHaveProperty("RepositoryID", "r1");
		});
	});

	describe("builds command options", () => {
		beforeEach(() => {
			repos(program);
		});

		it("should have required --repo-id option", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const buildsCmd = reposCmd?.commands.find((cmd) => cmd.name() === "builds");

			const repoIdOption = buildsCmd?.options.find((opt) => opt.long === "--repo-id");
			expect(repoIdOption).toBeDefined();
			expect(repoIdOption?.required).toBe(true);
		});

		it("should have pagination and filtering options", () => {
			const reposCmd = program.commands.find((cmd) => cmd.name() === "repos");
			const buildsCmd = reposCmd?.commands.find((cmd) => cmd.name() === "builds");

			const optionNames = buildsCmd?.options.map((opt) => opt.long) || [];

			expect(optionNames).toContain("--from");
			expect(optionNames).toContain("--to");
			expect(optionNames).toContain("--start-key");
			expect(optionNames).toContain("--count");
		});
	});
});
