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
		list: jest.fn().mockResolvedValue([{ webhookId: "w1" }]),
		getOne: jest.fn().mockResolvedValue({ webhookId: "w1", status: "active" }),
		create: jest.fn().mockResolvedValue({ webhookId: "w-new" }),
		update: jest.fn().mockResolvedValue({ webhookId: "w-new", status: "disabled" }),
		delete: jest.fn().mockResolvedValue({ ok: true }),
		getStats: jest.fn().mockResolvedValue({ count: 1 }),
		enable: jest.fn().mockResolvedValue({ webhookId: "w1", status: "active" }),
		disable: jest.fn().mockResolvedValue({ webhookId: "w1", status: "disabled" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ webhooks }),
		mockWebhooksAPI: webhooks,
	};
});

import webhooksCmd from "./webhooks";
const { mockWebhooksAPI } = jest.requireMock("../../utils/sdk");

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
	webhooksCmd(program);
	return program;
};

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

	it("create merges payload-file and then updates status", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({ description: "extra", other: 1 });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"webhooks",
			"create",
			"--url",
			"https://example.com/hook",
			"--events",
			"a,b,c",
			"--status",
			"disabled",
			"--payload-file",
			"extra.json",
		]);
		expect(mockWebhooksAPI.create).toHaveBeenCalledWith({
			url: "https://example.com/hook",
			events: ["a", "b", "c"],
			description: "extra", // ← changed from undefined
			other: 1,
		});
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("w-new", { status: "disabled" });
	});

	it("create without status fetches details via getOne", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "create", "--url", "https://x/h", "--events", "push"]);
		expect(mockWebhooksAPI.create).toHaveBeenCalled();
		expect(mockWebhooksAPI.getOne).toHaveBeenCalledWith("w-new");
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
			"x,y",
			"--description",
			"d",
			"--status",
			"active",
		]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-2", {
			url: "https://new",
			events: ["x", "y"],
			description: "d",
			status: "active",
		});
	});

	it("update status via --active", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-3", "--active"]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-3", { status: "active" });
	});

	it("update status via --disabled", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "webhooks", "update", "--webhook-id", "wid-4", "--disabled"]);
		expect(mockWebhooksAPI.update).toHaveBeenCalledWith("wid-4", { status: "disabled" });
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
			url: "https://u",
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
