import { Command } from "commander";
import path from "node:path";

jest.mock("../../utils/config", () => ({
	loadConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../utils/fsx", () => ({
	writeBinary: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("ora", () => {
	// start() returns the spinner so later start() calls keep working, as ora does.
	const spinner: any = {
		succeed: () => spinner,
		fail: () => spinner,
		warn: () => spinner,
		stop: () => spinner,
		start: () => spinner,
		text: "",
	};
	return { __esModule: true, default: () => spinner };
});

const mockReadFile = jest.fn();
jest.mock("node:fs/promises", () => ({
	__esModule: true,
	default: { readFile: mockReadFile },
	readFile: mockReadFile,
}));

jest.mock("../../utils/sdk", () => {
	const builds = {
		list: jest.fn().mockResolvedValue({ Builds: [], nextStartKey: undefined }),
		createFromSourceCode: jest.fn().mockResolvedValue({ ok: true }),
		getOne: jest.fn().mockResolvedValue({
			BuildID: "b1",
			Status: "Completed",
			UpdatedAt: "2025-10-01T00:00:00Z",
			CreatedAt: "2025-09-30T00:00:00Z",
		}),
		getOutputs: jest.fn().mockResolvedValue({
			Build: "https://example.com/build.txt",
			Errors: "https://example.com/errors.txt",
		}),
		waitForBuild: jest.fn().mockResolvedValue("Completed"),
		getStatus: jest.fn().mockResolvedValue("Completed"),
		createFromRepository: jest.fn().mockResolvedValue({ BuildID: "br1" }),
		cancel: jest.fn().mockResolvedValue(undefined),
		deleteOne: jest.fn().mockResolvedValue(undefined),
		updateOne: jest.fn().mockResolvedValue({ BuildID: "b1", IsPublic: true }),
		getVariables: jest.fn().mockResolvedValue({ BuildID: "b1", Variables: [], Count: 0 }),
		listTasks: jest.fn().mockResolvedValue({ Tasks: [], Count: 0 }),
		getBinary: jest.fn().mockResolvedValue({ url: "https://example.com/binary" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ builds }),
		mockBuildsAPI: builds,
	};
});

import buildsCmd from "./builds";
import { paginationBlock } from "../../test-utils/pagination";
const { mockBuildsAPI } = jest.requireMock("../../utils/sdk");
const { writeBinary } = jest.requireMock("../../utils/fsx");

const origFetch = global.fetch;
beforeAll(() => {
	global.fetch = jest.fn().mockResolvedValue({ text: jest.fn().mockResolvedValue("BUILD OUTPUT") }) as any;
});
afterAll(() => {
	global.fetch = origFetch as any;
});

const logs: string[] = [];
jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
	logs.push(args[0] != null ? String(args[0]) : "");
});
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
	buildsCmd(program);
	return program;
};

describe("builds CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
		exitCode = undefined;
	});

	it("list with no filters", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "list"]);
		expect(mockBuildsAPI.list).toHaveBeenCalledWith({
			startKey: undefined,
			from: undefined,
			to: undefined,
			status: undefined,
		});
	});

	it("list with filters and limit", async () => {
		mockBuildsAPI.list.mockResolvedValueOnce({
			Builds: [1, 2],
			Pagination: paginationBlock("tok_next", 2),
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"list",
			"--status",
			"Completed",
			"--from",
			"2025-09-01T00:00:00Z",
			"--to",
			"2025-10-01T00:00:00Z",
			"--start-key",
			"sk_123",
			"--count",
			"2",
			"--format",
			"json",
		]);
		expect(mockBuildsAPI.list).toHaveBeenCalledWith({
			startKey: "sk_123",
			from: "2025-09-01T00:00:00Z",
			to: "2025-10-01T00:00:00Z",
			status: "Completed",
		});
		// --status is applied after limit, so the request asks for a full page, not --count Builds.
		const out = JSON.parse(logs[0]);
		expect(out).toEqual({ Builds: [1, 2], Count: 2, Cursor: "tok_next" });
	});

	it("create:source with lang/core/args", async () => {
		mockReadFile.mockResolvedValueOnce("int main(){}");
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"create:source",
			"--file",
			"main.c",
			"--lang",
			"C",
			"--core-id",
			"core-123",
			"--args",
			"--fast",
		]);
		expect(mockBuildsAPI.createFromSourceCode).toHaveBeenCalledWith(
			{
				Code: "int main(){}",
				Language: "C",
				CoreID: "core-123",
				Arguments: "--fast",
			},
			undefined,
		);
	});

	it("create:source forwards --config-mk file contents as ConfigMk in the payload", async () => {
		mockReadFile
			.mockResolvedValueOnce("int main(){}")
			.mockResolvedValueOnce("EXTRA_LIBS = -lQuantLibB\nCXXFLAGS += -std=c++14\n");
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"create:source",
			"--file",
			"main.c",
			"--lang",
			"C",
			"--config-mk",
			"./config.mk",
		]);
		expect(mockBuildsAPI.createFromSourceCode.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				Code: "int main(){}",
				Language: "C",
				ConfigMk: "EXTRA_LIBS = -lQuantLibB\nCXXFLAGS += -std=c++14\n",
			}),
		);
	});

	it("status", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "status", "--build-id", "b-1"]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-1");
	});

	it("output-urls", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "output-urls", "--build-id", "b-2"]);
		expect(mockBuildsAPI.getOutputs).toHaveBeenCalledWith("b-2");
	});

	it("output to stdout", async () => {
		mockBuildsAPI.getOutputs.mockResolvedValueOnce({ Build: "https://example.com/out.txt" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "output", "--build-id", "b-3"]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-3");
		expect(mockBuildsAPI.getOutputs).toHaveBeenCalledWith("b-3");
		expect(global.fetch).toHaveBeenCalledWith("https://example.com/out.txt", { method: "GET" });
		expect(logs).toContain("BUILD OUTPUT");
	});

	it("output warns when build is not complete", async () => {
		mockBuildsAPI.getOne.mockResolvedValueOnce({
			BuildID: "b-3b",
			Status: "In Progress",
			UpdatedAt: "2025-10-01T00:00:00Z",
			CreatedAt: "2025-09-30T00:00:00Z",
		});
		mockBuildsAPI.getOutputs.mockResolvedValueOnce({ Build: "https://example.com/out.txt" });
		const program = makeProgram();
		// Should not throw even when build is not complete
		await program.parseAsync(["node", "x", "builds", "output", "--build-id", "b-3b"]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-3b");
	});

	it("output warns when output is empty", async () => {
		mockBuildsAPI.getOne.mockResolvedValueOnce({
			BuildID: "b-3c",
			Status: "Completed",
			UpdatedAt: "2025-10-01T00:00:00Z",
			CreatedAt: "2025-09-30T00:00:00Z",
		});
		mockBuildsAPI.getOutputs.mockResolvedValueOnce({ Build: "https://example.com/out.txt" });
		(global.fetch as jest.Mock).mockResolvedValueOnce({ text: jest.fn().mockResolvedValue("   ") });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "output", "--build-id", "b-3c"]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-3c");
	});

	it("output to file", async () => {
		mockBuildsAPI.getOutputs.mockResolvedValueOnce({ Build: "https://example.com/out.txt" });
		const program = makeProgram();
		const outPath = path.join("tmp", "build.txt");
		await program.parseAsync(["node", "x", "builds", "output", "--build-id", "b-4", "--out", outPath]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-4");
		const dir = path.resolve(path.dirname(outPath));
		const file = path.basename(outPath);
		expect(writeBinary).toHaveBeenCalledWith(dir, file, expect.any(Buffer));
	});

	it("watch exits 0 on Completed", async () => {
		mockBuildsAPI.waitForBuild.mockResolvedValueOnce("Completed");
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-5"])).rejects.toThrow(/EXIT/);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(0);
	});

	it("watch exits 1 on Cancelled", async () => {
		mockBuildsAPI.waitForBuild.mockResolvedValueOnce("Cancelled");
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("watch polls the status when the WebSocket fails", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		mockBuildsAPI.getStatus.mockResolvedValueOnce("In Progress").mockResolvedValueOnce("Completed");
		jest.useFakeTimers();
		try {
			const program = makeProgram();
			const run = program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6a"]);
			const settled = expect(run).rejects.toThrow(/EXIT/);
			await jest.advanceTimersByTimeAsync(3000);
			await settled;
		} finally {
			jest.useRealTimers();
		}
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledTimes(2);
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledWith("b-6a");
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(0);
	});

	it("watch exits 1 when the polled build is Stopped", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		mockBuildsAPI.getStatus.mockResolvedValueOnce("Stopped");
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6b"])).rejects.toThrow(
			/EXIT/,
		);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch exits 1 when the WebSocket fails and the status cannot be fetched", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		mockBuildsAPI.getStatus.mockRejectedValueOnce(new Error("Network Error"));
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6c"])).rejects.toThrow(
			/EXIT/,
		);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch exits 1 when the polled build is not finished before the timeout", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		let now = 0;
		const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
		// The first poll ends after the 1 s deadline.
		mockBuildsAPI.getStatus.mockImplementationOnce(async () => {
			now = 2000;
			return "In Progress";
		});
		const program = makeProgram();
		try {
			await expect(
				program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6d", "--timeout", "1"]),
			).rejects.toThrow(/EXIT/);
		} finally {
			clock.mockRestore();
		}
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledTimes(1);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch does not poll after the deadline", async () => {
		let now = 0;
		const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
		// The live wait gives up after the 1 s deadline, as the SDK does at its timeout.
		mockBuildsAPI.waitForBuild.mockImplementationOnce(async () => {
			now = 2000;
			throw new Error("Build waiting timeout");
		});
		// No status is queued: it must not be asked for, whatever it would say.
		const program = makeProgram();
		try {
			await expect(
				program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6e", "--timeout", "1"]),
			).rejects.toThrow(/EXIT/);
		} finally {
			clock.mockRestore();
		}
		expect(mockBuildsAPI.getStatus).not.toHaveBeenCalled();
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch exits 1 when a finished status arrives after the deadline", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		let now = 0;
		const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
		// The poll starts in time, but its answer comes after the 1 s deadline.
		mockBuildsAPI.getStatus.mockImplementationOnce(async () => {
			now = 2000;
			return "Completed";
		});
		const program = makeProgram();
		try {
			await expect(
				program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6g", "--timeout", "1"]),
			).rejects.toThrow(/EXIT/);
		} finally {
			clock.mockRestore();
		}
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledTimes(1);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch exits 1 at the deadline while a status request is still in flight", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		mockBuildsAPI.getStatus.mockImplementationOnce(() => new Promise(() => {}));
		jest.useFakeTimers();
		try {
			const program = makeProgram();
			const run = program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6h", "--timeout", "1"]);
			const settled = expect(run).rejects.toThrow(/EXIT/);
			await jest.advanceTimersByTimeAsync(1000);
			await settled;
		} finally {
			jest.useRealTimers();
		}
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledTimes(1);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("watch never sleeps past the deadline between polls", async () => {
		mockBuildsAPI.waitForBuild.mockRejectedValueOnce(new Error("WebSocket crashed: read ECONNRESET"));
		let now = 0;
		const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
		const timers = jest.spyOn(global, "setTimeout");
		// 400 ms of the 1 s budget are left after the first poll, none after the second.
		mockBuildsAPI.getStatus
			.mockImplementationOnce(async () => {
				now = 600;
				return "In Progress";
			})
			.mockImplementationOnce(async () => {
				now = 1000;
				return "In Progress";
			});
		const program = makeProgram();
		try {
			await expect(
				program.parseAsync(["node", "x", "builds", "watch", "--build-id", "b-6f", "--timeout", "1"]),
			).rejects.toThrow(/EXIT/);
		} finally {
			clock.mockRestore();
		}
		const delays = timers.mock.calls.map((call) => call[1]);
		timers.mockRestore();
		expect(delays).toContain(400);
		expect(delays).not.toContain(3000);
		expect(mockBuildsAPI.getStatus).toHaveBeenCalledTimes(2);
		expect((process.exit as unknown as jest.Mock).mock.calls[0][0]).toBe(1);
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "get", "--build-id", "b-7"]);
		expect(mockBuildsAPI.getOne).toHaveBeenCalledWith("b-7");
	});

	it("create:repo with args/core/discover-vars", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"create:repo",
			"--repo-id",
			"r_123",
			"--core-id",
			"core-9",
			"--args",
			"--foo",
			"--discover-vars",
		]);
		expect(mockBuildsAPI.createFromRepository).toHaveBeenCalledWith(
			"r_123",
			{ CoreID: "core-9", Arguments: "--foo" },
			true,
		);
	});

	it("create:repo --discover-variables sets discover flag", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "create:repo", "--repo-id", "r_124", "--discover-variables"]);
		expect(mockBuildsAPI.createFromRepository).toHaveBeenCalledWith("r_124", undefined, true);
	});

	it("cancel", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "cancel", "--build-id", "b-8"]);
		expect(mockBuildsAPI.cancel).toHaveBeenCalledWith("b-8");
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "delete", "--build-id", "b-9"]);
		expect(mockBuildsAPI.deleteOne).toHaveBeenCalledWith("b-9");
	});

	it("update --public sets IsPublic true", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "update", "--build-id", "b-10", "--public"]);
		expect(mockBuildsAPI.updateOne).toHaveBeenCalledWith("b-10", { IsPublic: true });
	});

	it("update --private sets IsPublic false", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "update", "--build-id", "b-11", "--private"]);
		expect(mockBuildsAPI.updateOne).toHaveBeenCalledWith("b-11", { IsPublic: false });
	});

	it("update --visibility public sets IsPublic true", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "update", "--build-id", "b-10a", "--visibility", "public"]);
		expect(mockBuildsAPI.updateOne).toHaveBeenCalledWith("b-10a", { IsPublic: true });
	});

	it("update --visibility private sets IsPublic false", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "update", "--build-id", "b-11a", "--visibility", "private"]);
		expect(mockBuildsAPI.updateOne).toHaveBeenCalledWith("b-11a", { IsPublic: false });
	});

	it.each([["--public"], ["--private"]])("update rejects --visibility together with %s", async (flag) => {
		const program = makeProgram();
		await expect(
			program.parseAsync([
				"node",
				"x",
				"builds",
				"update",
				"--build-id",
				"b-11c",
				"--visibility",
				"private",
				flag,
			]),
		).rejects.toThrow(/cannot be used with/);
		expect(mockBuildsAPI.updateOne).not.toHaveBeenCalled();
	});

	it("update without a visibility flag is a usage error and does not call the API", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "update", "--build-id", "b-11b"]);
		expect(process.exitCode).toBe(2);
		expect(mockBuildsAPI.updateOne).not.toHaveBeenCalled();
		process.exitCode = undefined;
	});

	it("variables", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "variables", "--build-id", "b-12"]);
		expect(mockBuildsAPI.getVariables).toHaveBeenCalledWith("b-12", {});
	});

	it("variables with start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "variables", "--build-id", "b-13", "--start-key", "sk_abc"]);
		expect(mockBuildsAPI.getVariables).toHaveBeenCalledWith("b-13", { startKey: "sk_abc" });
	});

	it("variables with cursor and limit", async () => {
		mockBuildsAPI.getVariables.mockResolvedValueOnce({
			BuildID: "b-13",
			Variables: [],
			Count: 0,
			Pagination: paginationBlock(),
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"variables",
			"--build-id",
			"b-13",
			"--cursor",
			"tok",
			"--limit",
			"10",
		]);
		expect(mockBuildsAPI.getVariables).toHaveBeenCalledWith("b-13", { cursor: "tok", limit: 10 });
	});

	it("tasks", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "tasks", "--build-id", "b-14"]);
		expect(mockBuildsAPI.listTasks).toHaveBeenCalledWith("b-14", {
			startKey: undefined,
			from: undefined,
			to: undefined,
		});
	});

	it("tasks reads pages up to --count, and ends with the Cursor to resume", async () => {
		const paged = (tasks: string[], next?: string) => ({
			Tasks: tasks,
			Count: tasks.length,
			Pagination: paginationBlock(next, 1),
		});
		mockBuildsAPI.listTasks.mockResolvedValueOnce(paged(["t1"], "s1")).mockResolvedValueOnce(paged(["t2"], "s2"));
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "tasks", "--build-id", "b-15", "--count", "2"]);
		expect(mockBuildsAPI.listTasks.mock.calls).toEqual([
			["b-15", { limit: 2, from: undefined, to: undefined }],
			["b-15", { cursor: "s1", limit: 1, from: undefined, to: undefined }],
		]);
		expect(JSON.parse(logs[logs.length - 1])).toEqual({
			BuildID: "b-15",
			Tasks: ["t1", "t2"],
			Count: 2,
			Cursor: "s2",
		});
	});

	it("tasks with filters", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"tasks",
			"--build-id",
			"b-15",
			"--start-key",
			"sk_xyz",
			"--from",
			"2025-01-01T00:00:00Z",
			"--to",
			"2025-02-01T00:00:00Z",
		]);
		expect(mockBuildsAPI.listTasks).toHaveBeenCalledWith("b-15", {
			startKey: "sk_xyz",
			from: "2025-01-01T00:00:00Z",
			to: "2025-02-01T00:00:00Z",
		});
	});

	it("binary", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "binary", "--build-id", "b-16"]);
		expect(mockBuildsAPI.getBinary).toHaveBeenCalledWith("b-16");
		expect(logs[0]).toContain("https://example.com/binary");
	});

	it("binary --url-only prints just the URL, not JSON", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "binary", "--build-id", "b-17", "--url-only"]);
		expect(mockBuildsAPI.getBinary).toHaveBeenCalledWith("b-17");
		expect(logs[0]).toBe("https://example.com/binary");
	});

	it("binary --out saves using the filename the Signaloid Cloud Compute Engine sends", async () => {
		const buildId = "bld_0123456789abcdef0123456789abcdef";
		mockBuildsAPI.getBinary.mockResolvedValueOnce({
			url: `https://example.com/${buildId}/${buildId}.bin?X-Amz-Signature=abc`,
		});
		(global.fetch as jest.Mock).mockResolvedValueOnce({
			ok: true,
			headers: new Headers({ "content-disposition": `attachment; filename="${buildId}.bin"` }),
			arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
		});

		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "binary", "--build-id", buildId, "--out", "tmp"]);

		expect(writeBinary).toHaveBeenCalledWith(path.resolve("tmp"), `${buildId}.bin`, expect.any(Buffer));
	});

	it("binary --filename still wins over the Signaloid Cloud Compute Engine name", async () => {
		const buildId = "bld_0123456789abcdef0123456789abcdef";
		(global.fetch as jest.Mock).mockResolvedValueOnce({
			ok: true,
			headers: new Headers({ "content-disposition": `attachment; filename="${buildId}.bin"` }),
			arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
		});

		const program = makeProgram();
		const argv = ["node", "x", "builds", "binary", "--build-id", buildId, "--out", "tmp"];
		await program.parseAsync([...argv, "--filename", "custom.bin"]);

		expect(writeBinary).toHaveBeenCalledWith(path.resolve("tmp"), "custom.bin", expect.any(Buffer));
	});
});
