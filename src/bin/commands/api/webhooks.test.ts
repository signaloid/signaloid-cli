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
	const webhooks = {
		list: jest.fn().mockResolvedValue({ Webhooks: [{ WebhookID: "w1" }], Count: 1 }),
		getOne: jest.fn().mockResolvedValue({ WebhookID: "w1", Status: "active" }),
		create: jest.fn().mockResolvedValue({ WebhookID: "w-new", Status: "active", Secret: "whsec_x" }),
		update: jest.fn().mockResolvedValue({ WebhookID: "w-new", Status: "disabled" }),
		delete: jest.fn().mockResolvedValue({ ok: true }),
		getStats: jest.fn().mockResolvedValue({ count: 1 }),
		enable: jest.fn().mockResolvedValue({ WebhookID: "w1", Status: "active" }),
		disable: jest.fn().mockResolvedValue({ WebhookID: "w1", Status: "disabled" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ webhooks }),
		mockWebhooksAPI: webhooks,
	};
});

import webhooksCmd from "./webhooks";
const { mockWebhooksAPI } = jest.requireMock("../../utils/sdk");

const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
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
	webhooksCmd(program);
	return program;
};

// Runs `webhooks create` with a valid URL, followed by the given arguments.
const runCreate = (...args: string[]) =>
	makeProgram().parseAsync(["node", "x", "webhooks", "create", "--url", "https://x/h", ...args]);

describe("webhooks CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
		mockLoadJsonIfPath.mockReset();
	});

	it("list", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "list"]);
		expect(mockWebhooksAPI.list).toHaveBeenCalled();
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "get", "--webhook-id", "wid-1"]);
		expect(mockWebhooksAPI.getOne).toHaveBeenCalledWith("wid-1");
	});

	it("create merges payload-file and then updates status, keeping the Secret", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({ Description: "extra", other: 1 });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"webhooks",
			"create",
			"--url",
			"https://example.com/hook",
			"--events",
			"task-status,build-status,task-count",
			"--status",
			"disabled",
			"--payload-file",
			"extra.json",
		]);
		expect(mockWebhooksAPI.create).toHaveBeenCalledWith({
			URL: "https://example.com/hook",
			Events: ["task-status", "build-status", "task-count"],
			Description: "extra",
			other: 1,
		});
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("w-new", { Status: "disabled" });
		expect(JSON.parse(logSpy.mock.calls.at(-1)![0])).toEqual({
			WebhookID: "w-new",
			Status: "disabled",
			Secret: "whsec_x",
		});
	});

	it("create without status prints the create response, Secret included", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		await runCreate("--events", "task-status");
		expect(mockWebhooksAPI.create).toHaveBeenCalled();
		expect(mockWebhooksAPI.getOne).not.toHaveBeenCalled();
		expect(mockWebhooksAPI.update).not.toHaveBeenCalled();
		expect(JSON.parse(logSpy.mock.calls.at(-1)![0]).Secret).toBe("whsec_x");
	});

	it("create refuses an unknown event before creating anything", async () => {
		await expect(runCreate("--events", "TaskStatusChange")).rejects.toThrow(/EXIT/);
		expect(mockWebhooksAPI.create).not.toHaveBeenCalled();
	});

	it("create requires --events", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		await expect(runCreate()).rejects.toThrow(/EXIT/);
		expect(mockWebhooksAPI.create).not.toHaveBeenCalled();
	});

	it("create refuses an invalid --status before creating anything", async () => {
		await expect(runCreate("--events", "task-status", "--status", "paused")).rejects.toThrow(/EXIT/);
		expect(mockWebhooksAPI.create).not.toHaveBeenCalled();
	});

	it("create prints the Secret even when the status update fails", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		mockWebhooksAPI.update.mockRejectedValueOnce(new Error("503"));
		await expect(runCreate("--events", "task-status", "--status", "disabled")).rejects.toThrow(/EXIT/);
		expect(JSON.parse(logSpy.mock.calls.at(-1)![0]).Secret).toBe("whsec_x");
	});

	it("refuses a payload file with the old lowercase fields", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({ events: ["task-status"] });
		const program = makeProgram();
		await expect(
			program.parseAsync([
				"node",
				"x",
				"webhooks",
				"update",
				"--webhook-id",
				"wid-7",
				"--payload-file",
				"old.json",
			]),
		).rejects.toThrow(/EXIT/);
		expect(mockWebhooksAPI.update).not.toHaveBeenCalled();
	});

	it("update sets fields and status via --status", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"webhooks",
			"update",
			"--webhook-id",
			"wid-2",
			"--url",
			"https://new",
			"--events",
			"task-stats,build-stats",
			"--description",
			"d",
			"--status",
			"active",
		]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-2", {
			URL: "https://new",
			Events: ["task-stats", "build-stats"],
			Description: "d",
			Status: "active",
		});
	});

	it("update status via --active", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-3", "--active"]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-3", { Status: "active" });
	});

	it("update status via --disabled", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-4", "--disabled"]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-4", { Status: "disabled" });
	});

	it("update merges payload-file", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({ headers: { k: "v" } });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"webhooks",
			"update",
			"--webhook-id",
			"wid-5",
			"--url",
			"https://u",
			"--payload-file",
			"p.json",
		]);
		expect(mockLoadJsonIfPath).toHaveBeenCalledWith("p.json");
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-5", {
			URL: "https://u",
			headers: { k: "v" },
		});
	});

	it("update exits on invalid --status", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-6", "--status", "weird"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("update exits when both --active and --disabled are set", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-7", "--active", "--disabled"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "delete", "--webhook-id", "wid-8"]);
		expect(mockWebhooksAPI.delete).toHaveBeenCalledWith("wid-8");
	});

	it("stats", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "stats"]);
		expect(mockWebhooksAPI.getStats).toHaveBeenCalled();
	});

	it("enable", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "enable", "--webhook-id", "wid-9"]);
		expect(mockWebhooksAPI.enable).toHaveBeenCalledWith("wid-9");
	});

	it("disable", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "disable", "--webhook-id", "wid-10"]);
		expect(mockWebhooksAPI.disable).toHaveBeenCalledWith("wid-10");
	});
});
