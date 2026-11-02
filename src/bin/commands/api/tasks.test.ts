import { Command } from "commander";
import path from "node:path";

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

const mockWriteBinary = jest.fn();
jest.mock("../../utils/fsx", () => ({
	writeBinary: jest.fn((...args) => mockWriteBinary(...args)),
}));

const mockLoadJsonIfPath = jest.fn();
const mockParseKeyVals = jest.fn((pairs: string[] = []) => {
	const out: Record<string, string> = {};
	for (const p of pairs) {
		const idx = String(p).indexOf("=");
		if (idx > -1) out[String(p).slice(0, idx)] = String(p).slice(idx + 1);
	}
	return out;
});
jest.mock("../../utils/params", () => ({
	loadJsonIfPath: jest.fn((...args) => mockLoadJsonIfPath(...args)),
	parseKeyVals: jest.fn((...args) => mockParseKeyVals(...(args as any))),
}));

jest.mock("../../utils/sdk", () => {
	const tasks = {
		createTask: jest.fn().mockResolvedValue({ TaskID: "t-new" }),
		list: jest.fn().mockResolvedValue({ Tasks: [], nextStartKey: undefined }),
		getOne: jest.fn().mockResolvedValue({ TaskID: "t1" }),
		getStatus: jest.fn().mockResolvedValue("Completed"),
		getOutputURLs: jest.fn().mockResolvedValue({ Stdout: "https://stdout", Stderr: "https://stderr" }),
		getOutput: jest.fn().mockResolvedValue("OUTPUT"),
		cancel: jest.fn().mockResolvedValue(undefined),
		deleteOne: jest.fn().mockResolvedValue(undefined),
		waitForTask: jest.fn().mockResolvedValue("completed"),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ tasks }),
		mockTasksAPI: tasks,
	};
});

import tasksCmd from "./tasks";
const { mockTasksAPI } = jest.requireMock("../../utils/sdk");

const logs: string[] = [];
jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
	logs.push(args.map(String).join(" "));
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
	tasksCmd(program);
	return program;
};

describe("tasks CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
		exitCode = undefined;
		mockWriteBinary.mockResolvedValue({ path: "", size: 0 });
	});

	it("create with build-id and --args overrides file and inline", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce({
			Arguments: "fromFile",
			DataSources: [{ ResourceID: "r", ResourceType: "t" }],
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"tasks",
			"create",
			"--build-id",
			"b-1",
			"--args",
			"CLI_ARGS",
			"--params-file",
			"file.json",
			"--param",
			"Arguments=INLINE",
		]);
		expect(mockTasksAPI.createTask).toHaveBeenCalledWith("b-1", expect.objectContaining({ Arguments: "CLI_ARGS" }));
	});

	it("create merges inline Arguments when no --args", async () => {
		mockLoadJsonIfPath.mockResolvedValueOnce(undefined);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "create", "--build-id", "b-2", "--param", "Arguments=INL"]);
		expect(mockTasksAPI.createTask).toHaveBeenCalledWith("b-2", { Arguments: "INL" });
	});

	it("list with filters and limit", async () => {
		mockTasksAPI.list.mockResolvedValueOnce({ Tasks: [1, 2, 3, 4] });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"tasks",
			"list",
			"--status",
			"Completed",
			"--from",
			"2025-09-01T00:00:00Z",
			"--to",
			"2025-10-01T00:00:00Z",
			"--start-key",
			"sk_1",
			"--count",
			"2",
			"--format",
			"json",
		]);
		expect(mockTasksAPI.list).toHaveBeenCalledWith({
			status: ["Completed"],
			from: "2025-09-01T00:00:00Z",
			to: "2025-10-01T00:00:00Z",
			startKey: "sk_1",
		});
		const out = JSON.parse(logs[0]);
		expect(out.Tasks.length).toBe(2);
	});

	it("list without options", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "list"]);
		expect(mockTasksAPI.list).toHaveBeenCalledWith({
			status: undefined,
			from: undefined,
			to: undefined,
			startKey: undefined,
		});
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "get", "--task-id", "t-1"]);
		expect(mockTasksAPI.getOne).toHaveBeenCalledWith("t-1");
	});

	it("status prints wrapper with TaskID", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "status", "--task-id", "t-2"]);
		expect(mockTasksAPI.getStatus).toHaveBeenCalledWith("t-2");
		const json = JSON.parse(logs[0]);
		expect(json.TaskID).toBe("t-2");
		expect(json.Status).toBe("Completed");
	});

	it("output-urls", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "output-urls", "--task-id", "t-3"]);
		expect(mockTasksAPI.getOutputURLs).toHaveBeenCalledWith("t-3");
	});

	it("output stdout to console (no --out)", async () => {
		mockTasksAPI.getOutput.mockResolvedValueOnce("STDOUT DATA");
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "output", "--task-id", "t-4", "--stream", "stdout"]);
		expect(mockTasksAPI.getOutput).toHaveBeenCalledWith("t-4", "Stdout", undefined);
		expect(exitCode).toBeUndefined();
	});

	it("output stderr to file when --out set", async () => {
		mockTasksAPI.getOutput.mockResolvedValueOnce("ERR DATA");
		const program = makeProgram();
		const outPath = path.join("out", "err.txt");
		await program.parseAsync([
			"node",
			"x",
			"tasks",
			"output",
			"--task-id",
			"t-5",
			"--stream",
			"stderr",
			"--out",
			outPath,
		]);
		expect(mockTasksAPI.getOutput).toHaveBeenCalledWith("t-5", "Stderr", undefined);
		const dir = path.resolve(path.dirname(outPath));
		const file = path.basename(outPath);
		expect(mockWriteBinary).toHaveBeenCalledWith(dir, file, expect.any(Buffer));
	});

	it("cancel", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "cancel", "--task-id", "t-6"]);
		expect(mockTasksAPI.cancel).toHaveBeenCalledWith("t-6");
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "tasks", "delete", "--task-id", "t-7"]);
		expect(mockTasksAPI.deleteOne).toHaveBeenCalledWith("t-7");
	});

	it("watch exits on completed", async () => {
		mockTasksAPI.waitForTask.mockResolvedValueOnce("completed");
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "tasks", "watch", "--task-id", "t-8"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBeDefined();
	});

	it("watch exits 1 on cancelled", async () => {
		mockTasksAPI.waitForTask.mockResolvedValueOnce("Cancelled");
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "tasks", "watch", "--task-id", "t-9"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});
});
