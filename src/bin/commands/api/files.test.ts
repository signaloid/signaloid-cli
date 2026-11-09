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

const mockToBuffer = jest.fn();
jest.mock("../../utils/binary", () => ({
	toBuffer: jest.fn((x) => mockToBuffer(x)),
}));

const mockEnsureDir = jest.fn();
const mockWriteBinary = jest.fn();
jest.mock("../../utils/fsx", () => ({
	ensureDir: jest.fn((...args) => mockEnsureDir(...args)),
	writeBinary: jest.fn((...args) => mockWriteBinary(...args)),
}));

jest.mock("../../utils/sdk", () => {
	const files = {
		list: jest.fn().mockResolvedValue({ Files: [] }),
		get: jest.fn().mockResolvedValue({}),
		upload: jest.fn().mockResolvedValue({ ok: true }),
		createDirectory: jest.fn().mockResolvedValue({ created: true }),
		delete: jest.fn().mockResolvedValue({ deleted: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ files }),
		mockFilesAPI: files,
	};
});

import filesCmd from "./files";
import { paginationBlock } from "../../test-utils/pagination";
const { mockFilesAPI } = jest.requireMock("../../utils/sdk");
const { toBuffer } = jest.requireMock("../../utils/binary");
const { ensureDir, writeBinary } = jest.requireMock("../../utils/fsx");

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
	filesCmd(program);
	return program;
};

describe("files CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
		exitCode = undefined;
		process.exitCode = undefined;
	});

	afterAll(() => {
		process.exitCode = undefined;
	});

	it("ls without options", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "ls"]);
		expect(mockFilesAPI.list).toHaveBeenCalledWith({ path: undefined, startKey: undefined });
	});

	it("ls with path and start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "ls", "--path", "datasets/", "--start-key", "sk_1"]);
		expect(mockFilesAPI.list).toHaveBeenCalledWith({ path: "datasets/", startKey: "sk_1" });
	});

	it("stat calls get with no download", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "stat", "--path", "datasets/a.csv"]);
		expect(mockFilesAPI.get).toHaveBeenCalledWith("datasets/a.csv", false);
	});

	it("download saves to default dir/name", async () => {
		// Current implementation JSON.parses the result of get(); provide an object without DownloadURL
		// so it falls into the toBuffer() path
		mockFilesAPI.get.mockResolvedValueOnce(JSON.stringify({ name: "file.txt" }));
		mockToBuffer.mockResolvedValueOnce(Buffer.from("DATA"));
		mockWriteBinary.mockResolvedValueOnce(path.resolve("./downloads", "file.txt"));
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "download", "--path", "folder/file.txt"]);
		expect(mockFilesAPI.get).toHaveBeenCalledWith("folder/file.txt", true);
		expect(ensureDir).toHaveBeenCalledWith(path.resolve("./downloads"));
		expect(writeBinary).toHaveBeenCalledWith(path.resolve("./downloads"), "file.txt", expect.any(Buffer));
	});

	it("download honors --out and --name", async () => {
		// Current implementation JSON.parses the result of get(); provide an object without DownloadURL
		// so it falls into the toBuffer() path
		mockFilesAPI.get.mockResolvedValueOnce(JSON.stringify({ name: "c.bin" }));
		mockToBuffer.mockResolvedValueOnce(Buffer.from("Z"));
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"files",
			"download",
			"--path",
			"a/b/c.bin",
			"--out",
			"outdir",
			"--name",
			"saved.bin",
		]);
		expect(ensureDir).toHaveBeenCalledWith(path.resolve("outdir"));
		expect(writeBinary).toHaveBeenCalledWith(path.resolve("outdir"), "saved.bin", expect.any(Buffer));
	});

	it("upload with --text", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "upload", "--path", "datasets/note.txt", "--text", "hello"]);
		expect(mockFilesAPI.upload).toHaveBeenCalledWith("datasets/note.txt", "hello");
	});

	it("upload with --from", async () => {
		const buf = new Uint8Array(Buffer.from("abc")).buffer;
		mockReadFile.mockResolvedValueOnce(buf);
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"files",
			"upload",
			"--path",
			"datasets/file.bin",
			"--from",
			"local.bin",
		]);
		expect(mockFilesAPI.upload).toHaveBeenCalledWith("datasets/file.bin", buf);
	});

	it("upload fails if neither --from nor --text", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "files", "upload", "--path", "datasets/empty.txt"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});

	it("upload with both --from and --text is a usage error", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"files",
			"upload",
			"--path",
			"datasets/both.txt",
			"--from",
			"local.txt",
			"--text",
			"hello",
		]);
		expect(mockFilesAPI.upload).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(2);
	});

	it("ls --count follows Pagination.Links.Next and prints where to resume", async () => {
		mockFilesAPI.list
			.mockResolvedValueOnce({
				Count: 2,
				Files: [{ Path: "a" }, { Path: "b" }],
				Pagination: paginationBlock("t1", 3),
			})
			.mockResolvedValueOnce({ Count: 1, Files: [{ Path: "c" }], Pagination: paginationBlock("t2", 3) });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "ls", "--path", "d/", "--count", "3"]);
		expect(mockFilesAPI.list).toHaveBeenNthCalledWith(1, { path: "d/", limit: 3 });
		expect(mockFilesAPI.list).toHaveBeenNthCalledWith(2, { path: "d/", cursor: "t1", limit: 1 });
		const output = JSON.parse(logs[logs.length - 1]);
		expect(output.Files).toHaveLength(3);
		expect(output.Cursor).toBe("t2");
	});

	it("ls --count follows ContinuationKey against an API without Pagination", async () => {
		mockFilesAPI.list
			.mockResolvedValueOnce({ Count: 2, Files: [{ Path: "a" }, { Path: "b" }], ContinuationKey: "k1" })
			.mockResolvedValueOnce({ Count: 1, Files: [{ Path: "c" }] });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "ls", "--count", "3"]);
		expect(mockFilesAPI.list).toHaveBeenNthCalledWith(2, { path: undefined, startKey: "k1", limit: 1 });
		expect(JSON.parse(logs[logs.length - 1]).Files).toHaveLength(3);
	});

	it("mkdir creates directory", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "mkdir", "--path", "datasets/newdir/"]);
		expect(mockFilesAPI.createDirectory).toHaveBeenCalledWith("datasets/newdir/");
	});

	it("rm deletes file", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "rm", "--path", "datasets/a.csv"]);
		expect(mockFilesAPI.delete).toHaveBeenCalledWith("datasets/a.csv", { recursive: false, directory: false });
	});

	it("rm --recursive without --directory prints the usage error on stderr", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "rm", "--path", "datasets/dir/", "--recursive"]);
		expect(mockFilesAPI.delete).not.toHaveBeenCalled();
		expect(logs).toEqual([]);
		expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/--directory with --recursive/));
		expect(process.exitCode).toBe(2);
	});

	it("rm deletes directory recursively", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "files", "rm", "--path", "datasets/dir/", "--recursive", "--directory"]);
		expect(mockFilesAPI.delete).toHaveBeenCalledWith("datasets/dir/", { recursive: true, directory: true });
	});
});
