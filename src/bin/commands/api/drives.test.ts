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

const mockReadFile = jest.fn();
jest.mock("node:fs/promises", () => ({
	__esModule: true,
	default: { readFile: mockReadFile },
	readFile: mockReadFile,
}));

jest.mock("../../utils/sdk", () => {
	const drives = {
		list: jest.fn().mockResolvedValue({ UserID: "usr_1", DriveIDs: [], Count: 0 }),
		getOne: jest.fn().mockResolvedValue({ DriveID: "d1" }),
		create: jest.fn().mockResolvedValue({ DriveID: "d2" }),
		update: jest.fn().mockResolvedValue({ DriveID: "d3" }),
		delete: jest.fn().mockResolvedValue({ ok: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ drives }),
		mockDrivesAPI: drives,
	};
});

import drivesCmd from "./drives";
import { paginationBlock } from "../../test-utils/pagination";
const { mockDrivesAPI } = jest.requireMock("../../utils/sdk");

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
	drivesCmd(program);
	return program;
};

describe("drives CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
		exitCode = undefined;
	});

	it("list without start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "list"]);
		expect(mockDrivesAPI.list).toHaveBeenCalledWith({});
	});

	it("list with cursor and limit", async () => {
		mockDrivesAPI.list.mockResolvedValueOnce({
			UserID: "usr_1",
			DriveIDs: [],
			Count: 0,
			Pagination: paginationBlock(),
		});
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "list", "--cursor", "tok_1", "--limit", "50"]);
		expect(mockDrivesAPI.list).toHaveBeenCalledWith({ cursor: "tok_1", limit: 50 });
	});

	it("list refuses --cursor together with --start-key", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "list", "--cursor", "tok", "--start-key", "raw"]),
		).rejects.toThrow(/cannot be used with/);
		expect(mockDrivesAPI.list).not.toHaveBeenCalled();
	});

	it("list has no --start, which is now --cursor", async () => {
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "drives", "list", "--start", "tok"])).rejects.toThrow(
			/unknown option/,
		);
		expect(mockDrivesAPI.list).not.toHaveBeenCalled();
	});

	it("list with start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "list", "--start-key", "sk_123"]);
		expect(mockDrivesAPI.list).toHaveBeenCalledWith({ startKey: "sk_123" });
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "get", "--drive-id", "drv-1"]);
		expect(mockDrivesAPI.getOne).toHaveBeenCalledWith("drv-1");
	});

	it("create with --ds flags only", async () => {
		const program = makeProgram();
		const ds1 = JSON.stringify({ ResourceID: "b1", ResourceType: "Bucket", Location: "/" });
		const ds2 = JSON.stringify({ ResourceID: "scs1", ResourceType: "SignaloidCloudStorage", Location: "mnt" });
		await program.parseAsync(["node", "x", "drives", "create", "--name", "MyDrive", "--ds", ds1, "--ds", ds2]);
		expect(mockDrivesAPI.create).toHaveBeenCalledWith({
			Name: "MyDrive",
			DataSources: [
				{ Object: "DataSource", ResourceID: "b1", ResourceType: "Bucket", Location: "/" },
				{ Object: "DataSource", ResourceID: "scs1", ResourceType: "SignaloidCloudStorage", Location: "mnt" },
			],
		});
	});

	it("create with --ds-file only", async () => {
		const dsArr = [
			{ ResourceID: "b9", ResourceType: "Bucket", Location: "/" },
			{ ResourceID: "scs1", ResourceType: "SignaloidCloudStorage", Location: "/home" },
		];
		mockReadFile.mockResolvedValueOnce(JSON.stringify(dsArr));
		const program = makeProgram();
		const filePath = path.join("tmp", "datasources.json");
		await program.parseAsync(["node", "x", "drives", "create", "--name", "FromFile", "--ds-file", filePath]);
		expect(mockDrivesAPI.create).toHaveBeenCalledWith({
			Name: "FromFile",
			DataSources: [
				{ Object: "DataSource", ResourceID: "b9", ResourceType: "Bucket", Location: "/" },
				{ Object: "DataSource", ResourceID: "scs1", ResourceType: "SignaloidCloudStorage", Location: "/home" },
			],
		});
	});

	it("create with no ds", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "create", "--name", "Empty"]);
		expect(mockDrivesAPI.create).toHaveBeenCalledWith({ Name: "Empty", DataSources: [] });
	});

	it("update name only", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "update", "--drive-id", "drv-2", "--name", "Renamed"]);
		expect(mockDrivesAPI.update).toHaveBeenCalledWith("drv-2", { Name: "Renamed" });
	});

	it("update with --ds flags", async () => {
		const program = makeProgram();
		const ds = JSON.stringify({ ResourceID: "bkt2", ResourceType: "Bucket", Location: "c" });
		await program.parseAsync(["node", "x", "drives", "update", "--drive-id", "drv-3", "--ds", ds]);
		expect(mockDrivesAPI.update).toHaveBeenCalledWith("drv-3", {
			DataSources: [{ Object: "DataSource", ResourceID: "bkt2", ResourceType: "Bucket", Location: "c" }],
		});
	});

	it("update with --ds-file", async () => {
		const dsArr = [{ ResourceID: "b7", ResourceType: "Bucket", Location: "/x" }];
		mockReadFile.mockResolvedValueOnce(JSON.stringify(dsArr));
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"drives",
			"update",
			"--drive-id",
			"drv-4",
			"--ds-file",
			"datasources.json",
		]);
		expect(mockDrivesAPI.update).toHaveBeenCalledWith("drv-4", {
			DataSources: [{ Object: "DataSource", ResourceID: "b7", ResourceType: "Bucket", Location: "/x" }],
		});
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "drives", "delete", "--drive-id", "drv-5"]);
		expect(mockDrivesAPI.delete).toHaveBeenCalledWith("drv-5");
	});

	it("fails on invalid --ds json", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "create", "--name", "Bad", "--ds", "{not json}"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("fails on invalid --ds-file contents", async () => {
		mockReadFile.mockResolvedValueOnce("{ bad json");
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "create", "--name", "BadFile", "--ds-file", "file.json"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("--ds-file must be array", async () => {
		mockReadFile.mockResolvedValueOnce(JSON.stringify({ not: "array" }));
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "create", "--name", "BadType", "--ds-file", "file.json"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("invalid ResourceType in --ds", async () => {
		const bad = JSON.stringify({ ResourceID: "z", ResourceType: "Nope", Location: "/" });
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "create", "--name", "BadType", "--ds", bad]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("missing fields in --ds", async () => {
		const bad = JSON.stringify({ ResourceID: "", ResourceType: "Bucket", Location: "" });
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "drives", "create", "--name", "BadMissing", "--ds", bad]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});
});
