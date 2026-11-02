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
		mockBuildsAPI.list.mockResolvedValueOnce({ Builds: [1, 2, 3, 4] });
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
		const out = JSON.parse(logs[0]);
		expect(out.Builds.length).toBe(2);
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
		await program.parseAsync([
			"node",
			"x",
			"builds",
			"create:repo",
			"--repo-id",
			"r_124",
			"--discover-variables",
		]);
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
		expect(mockBuildsAPI.getVariables).toHaveBeenCalledWith("b-12", undefined);
	});

	it("variables with start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "builds", "variables", "--build-id", "b-13", "--start-key", "sk_abc"]);
		expect(mockBuildsAPI.getVariables).toHaveBeenCalledWith("b-13", "sk_abc");
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

	it("tasks with filters", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node", "x", "builds", "tasks",
			"--build-id", "b-15",
			"--start-key", "sk_xyz",
			"--from", "2025-01-01T00:00:00Z",
			"--to", "2025-02-01T00:00:00Z",
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

	it("binary --out saves using the filename the server sends", async () => {
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

	it("binary --filename still wins over the server name", async () => {
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
