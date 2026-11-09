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

const mockLoadJsonIfPath = jest.fn();
jest.mock("../../utils/params", () => ({
	loadJsonIfPath: jest.fn((...args) => mockLoadJsonIfPath(...args)),
}));

jest.mock("../../utils/sdk", () => {
	const users = {
		me: jest.fn().mockResolvedValue({ UserID: "u-1", Username: "me" }),
		update: jest.fn().mockResolvedValue({ ok: true }),
		getLogs: jest.fn().mockResolvedValue({ items: [] }),
		logoutAllSessions: jest.fn().mockResolvedValue({ ok: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ users }),
		mockUsersAPI: users,
	};
});

import usersCmd from "./users";
import { paginationBlock } from "../../test-utils/pagination";
const { mockUsersAPI } = jest.requireMock("../../utils/sdk");

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
	usersCmd(program);
	return program;
};

describe("users CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
	});

	it("me", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "users", "me"]);
		expect(mockUsersAPI.me).toHaveBeenCalled();
	});

	it("update with inline preferences", async () => {
		mockLoadJsonIfPath.mockReset();
		const program = makeProgram();
		await program.parseAsync(["node", "x", "users", "update", "--pref", "theme=dark", "--pref", "lang=en"]);
		expect(mockUsersAPI.update).toHaveBeenCalledWith("u-1", {
			Preferences: { theme: "dark", lang: "en" },
		});
	});

	it("update merges payload-file", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({ Preferences: { theme: "dark" } });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "users", "update", "--payload-file", "extra.json"]);
		expect(mockLoadJsonIfPath).toHaveBeenCalledWith("extra.json");
		expect(mockUsersAPI.update).toHaveBeenCalledWith("u-1", { Preferences: { theme: "dark" } });
	});

	it("logs with from/to and limit", async () => {
		mockUsersAPI.me.mockResolvedValueOnce({ UserID: "u-2" });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"users",
			"logs",
			"--from",
			"2030-01-01T00:00:00Z",
			"--to",
			"2030-01-02T00:00:00Z",
			"--count",
			"50",
		]);
		expect(mockUsersAPI.getLogs).toHaveBeenCalledWith("u-2", {
			startTime: new Date("2030-01-01T00:00:00Z").getTime(),
			endTime: new Date("2030-01-02T00:00:00Z").getTime(),
			limit: 50,
		});
	});

	it("logs keeps queryTimeRange and totalResults in its output", async () => {
		mockUsersAPI.me.mockResolvedValueOnce({ UserID: "u-3" });
		const range = { startTime: 1000, endTime: 2000 };
		mockUsersAPI.getLogs.mockResolvedValueOnce({
			logs: [{ eventType: "SignIn" }],
			queryTimeRange: range,
			totalResults: 1,
			Pagination: paginationBlock(undefined, 100),
		});
		const program = makeProgram();
		await program.parseAsync(["node", "x", "users", "logs"]);
		const log = jest.mocked(console.log);
		expect(JSON.parse(log.mock.calls[log.mock.calls.length - 1][0])).toEqual({
			logs: [{ eventType: "SignIn" }],
			queryTimeRange: range,
			totalResults: 1,
		});
	});

	it("logs exits on invalid from date", async () => {
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "users", "logs", "--from", "bad-date"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("logout-all", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "users", "logout-all", "--user-id", "target-1"]);
		expect(mockUsersAPI.logoutAllSessions).toHaveBeenCalledWith("target-1");
	});

	it("update --remove rejects a field the API cannot remove", async () => {
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "users", "update", "--remove", "Theme"])).rejects.toThrow(
			/must be one of/,
		);
		expect(mockUsersAPI.update).not.toHaveBeenCalled();
	});

	it("update exits on error", async () => {
		mockUsersAPI.update.mockRejectedValueOnce(new Error("fail"));
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "users", "update", "--pref", "theme=dark"])).rejects.toThrow(
			/EXIT/,
		);
		expect(exitCode).toBe(1);
	});
});
