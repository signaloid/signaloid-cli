import { Command } from "commander";

jest.mock("../../utils/config", () => ({
	loadConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("ora", () => ({
	__esModule: true,
	default: () => ({
		start: () => ({ succeed: () => ({}) as any, fail: () => ({}) as any, warn: () => ({}) as any }),
		succeed: () => ({}) as any,
		fail: () => ({}) as any,
		warn: () => ({}) as any,
	}),
}));

jest.mock("../../utils/sdk", () => {
	const users = {
		me: jest.fn().mockResolvedValue({ id: "me-123" }),
	};
	const github = {
		getIntegration: jest.fn().mockResolvedValue({ ok: true }),
		createOrUpdateIntegration: jest.fn().mockResolvedValue({ ok: true }),
		deleteIntegration: jest.fn().mockResolvedValue({ ok: true }),
		proxyRequest: jest.fn().mockResolvedValue({ ok: true }),
	};
	const makeClient = jest.fn().mockReturnValue({ users, github });
	return {
		__esModule: true,
		makeClient,
		mockUsersAPI: users,
		mockGithubAPI: github,
	};
});

import githubCmd from "./github";
const { mockUsersAPI, mockGithubAPI } = jest.requireMock("../../utils/sdk");

const logs: string[] = [];
jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
	logs.push(args[0] != null ? String(args[0]) : "");
});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(process, "exit").mockImplementation((() => {
	throw new Error("EXIT");
}) as any);

const makeProgram = () => {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({ writeOut() {}, writeErr() {} });
	githubCmd(program);
	return program;
};

describe("github CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
	});

	it("status with explicit --user-id", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "status", "--user-id", "u-1"]);
		expect(mockGithubAPI.getIntegration).toHaveBeenCalledWith("u-1");
	});

	it("status renames GithubUsername to Username in output", async () => {
		mockGithubAPI.getIntegration.mockResolvedValueOnce({ GithubUsername: "octocat", Connected: true });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "status", "--user-id", "u-1"]);
		const out = JSON.parse(logs[0]);
		expect(out).not.toHaveProperty("GithubUsername");
		expect(out).toHaveProperty("Username", "octocat");
		expect(out).toHaveProperty("Connected", true);
	});

	it("status without --user-id uses users.me()", async () => {
		mockUsersAPI.me.mockResolvedValueOnce({ UserID: "ME-UPPER" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "status"]);
		expect(mockGithubAPI.getIntegration).toHaveBeenCalledWith("ME-UPPER");
	});

	it("connect with implicit user id", async () => {
		mockUsersAPI.me.mockResolvedValueOnce({ userID: "me-low" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "connect", "--token", "oauth_code_abc"]);
		expect(mockGithubAPI.createOrUpdateIntegration).toHaveBeenCalledWith("me-low", {
			GithubAuthCode: "oauth_code_abc",
		});
	});

	it("disconnect with explicit user id", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "disconnect", "--user-id", "uid-9"]);
		expect(mockGithubAPI.deleteIntegration).toHaveBeenCalledWith("uid-9");
	});

	it("proxy defaults to GET and forwards path", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "proxy", "--path", "user/repos"]);
		expect(mockGithubAPI.proxyRequest).toHaveBeenCalledWith("user/repos", "GET");
	});

	it("proxy honors custom method", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "proxy", "--path", "user", "--method", "post"]);
		expect(mockGithubAPI.proxyRequest).toHaveBeenCalledWith("user", "POST");
	});

	it("repos uses proxy GET user/repos", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "repos"]);
		expect(mockGithubAPI.proxyRequest).toHaveBeenCalledWith("user/repos", "GET");
	});

	it("branches builds path correctly", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "github", "branches", "--owner", "o", "--repo", "r"]);
		expect(mockGithubAPI.proxyRequest).toHaveBeenCalledWith("repos/o/r/branches", "GET");
	});
});
