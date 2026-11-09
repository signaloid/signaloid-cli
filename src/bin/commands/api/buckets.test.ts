import { Command } from "commander";

jest.mock("../../utils/config", () => ({
	loadConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../utils/sdk", () => {
	const mockBucketsAPI = {
		list: jest.fn().mockResolvedValue({ UserID: "usr_1", BucketIDs: [], Count: 0 }),
		getOne: jest.fn(),
		create: jest.fn().mockResolvedValue({}),
		update: jest.fn().mockResolvedValue({}),
		delete: jest.fn().mockResolvedValue({}),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ buckets: mockBucketsAPI }),
		mockBucketsAPI,
	};
});

jest.mock("ora", () => ({
	__esModule: true,
	default: () => ({
		start: () => ({ succeed: () => ({}) as any, fail: () => ({}) as any }),
		succeed: () => ({}) as any,
		fail: () => ({}) as any,
	}),
}));

import buckets from "./buckets";

const { mockBucketsAPI } = jest.requireMock("../../utils/sdk");

const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
	throw new Error(`process.exit called with ${code}`);
}) as any);

describe("buckets CLI", () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	const makeProgram = () => {
		const program = new Command();
		program.exitOverride();
		program.configureOutput({ writeOut() {}, writeErr() {} });
		buckets(program);
		return program;
	};

	it("runs buckets list without start-key", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "list"]);
		expect(mockBucketsAPI.list).toHaveBeenCalledTimes(1);
		const call = mockBucketsAPI.list.mock.calls[0];
		expect(call.length === 0 || call[0] === undefined || call[0]?.startKey === undefined).toBe(true);
		expect(logSpy).toHaveBeenCalled();
	});

	it("buckets list --count pages past an empty page and prints the last ContinuationKey", async () => {
		mockBucketsAPI.list
			.mockResolvedValueOnce({ UserID: "usr_1", BucketIDs: ["bkt_a"], Count: 1, ContinuationKey: "bkt_a" })
			.mockResolvedValueOnce({ UserID: "usr_1", BucketIDs: [], Count: 0, ContinuationKey: "bkt_m" })
			.mockResolvedValueOnce({ UserID: "usr_1", BucketIDs: ["bkt_b"], Count: 1, ContinuationKey: "bkt_b" });
		mockBucketsAPI.getOne.mockImplementation(async (id: string) => ({ BucketID: id }));
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "list", "--count", "2"]);
		expect(mockBucketsAPI.list).toHaveBeenCalledTimes(3);
		const output = JSON.parse(logSpy.mock.calls.at(-1)![0]);
		expect(output.Buckets).toEqual([{ BucketID: "bkt_a" }, { BucketID: "bkt_b" }]);
		expect(output.ContinuationKey).toBe("bkt_b");
	});

	it("runs buckets list --start-key abc", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "list", "--start-key", "abc"]);
		expect(mockBucketsAPI.list).toHaveBeenCalledWith({ startKey: "abc" });
	});

	it("runs buckets create with all options", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"test",
			"buckets",
			"create",
			"--name",
			"my-bucket",
			"--account",
			"acc-123",
			"--read",
			"--write",
		]);
		expect(mockBucketsAPI.create).toHaveBeenCalledWith({
			Name: "my-bucket",
			Account: "acc-123",
			Read: true,
			Write: true,
		});
		expect(logSpy).toHaveBeenCalled();
	});

	it("runs buckets update with subset of options", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"test",
			"buckets",
			"update",
			"--bucket-id",
			"bucket-1",
			"--name",
			"renamed",
			"--write",
		]);
		expect(mockBucketsAPI.update).toHaveBeenCalledWith("bucket-1", {
			Name: "renamed",
			Write: true,
		});
		expect(logSpy).toHaveBeenCalled();
	});

	it.each([
		[["--no-read", "--no-write"], { Read: false, Write: false }],
		[["--read", "--no-write"], { Read: true, Write: false }],
	])("runs buckets update %j", async (flags, patch) => {
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "update", "--bucket-id", "bucket-1", ...flags]);
		expect(mockBucketsAPI.update).toHaveBeenCalledWith("bucket-1", patch);
	});

	it("buckets update without read/write flags sends neither field", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "update", "--bucket-id", "bucket-1", "--name", "n"]);
		expect(mockBucketsAPI.update).toHaveBeenCalledWith("bucket-1", { Name: "n" });
	});

	it("runs buckets delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "test", "buckets", "delete", "--bucket-id", "bucket-9"]);
		expect(mockBucketsAPI.delete).toHaveBeenCalledWith("bucket-9");
		expect(logSpy).toHaveBeenCalled();
	});
});
