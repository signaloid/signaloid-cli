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

const mockLoadUxPayloadFile = jest.fn();
jest.mock("../../utils/params", () => ({
	...jest.requireActual("../../utils/params"),
	loadUxPayloadFile: jest.fn((...args) => mockLoadUxPayloadFile(...args)),
}));

jest.mock("../../utils/sdk", () => {
	const samples = {
		getSamples: jest.fn().mockResolvedValue({ ok: true }),
		getSamplesFromUx: jest.fn().mockResolvedValue({ ok: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ samples }),
		mockSamplesAPI: samples,
	};
});

import samplesCmd from "./samples";
const { mockSamplesAPI } = jest.requireMock("../../utils/sdk");

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
	samplesCmd(program);
	return program;
};

describe("samples CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
	});

	it("get with required flags (deprecated params)", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "samples", "from-value-id", "--task-id", "t1", "--value-id", "v1"]);
		expect(mockSamplesAPI.getSamples).toHaveBeenCalledWith({ taskID: "t1", valueID: "v1", count: undefined });
	});

	it("get with new parameter names", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "samples", "from-value-id", "--task-id", "t1", "--value-id", "v1"]);
		expect(mockSamplesAPI.getSamples).toHaveBeenCalledWith({ taskID: "t1", valueID: "v1", count: undefined });
	});

	it("get with count", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"samples",
			"from-value-id",
			"--task-id",
			"t2",
			"--value-id",
			"v2",
			"--count",
			"500",
		]);
		expect(mockSamplesAPI.getSamples).toHaveBeenCalledWith({ taskID: "t2", valueID: "v2", count: 500 });
	});

	it("from-ux with payload and count", async () => {
		mockLoadUxPayloadFile.mockResolvedValueOnce("ux");
		const program = makeProgram();
		await program.parseAsync(["node", "x", "samples", "from-ux-string", "--file", "ux.json", "--count", "123"]);
		expect(mockLoadUxPayloadFile).toHaveBeenCalledWith("ux.json", { uxStringOnly: true });
		expect(mockSamplesAPI.getSamplesFromUx).toHaveBeenCalledWith("ux", 123);
	});

	it("from-ux without count", async () => {
		mockLoadUxPayloadFile.mockResolvedValueOnce("ux2");
		const program = makeProgram();
		await program.parseAsync(["node", "x", "samples", "from-ux-string", "--file", "ux2.json"]);
		expect(mockSamplesAPI.getSamplesFromUx).toHaveBeenCalledWith("ux2", undefined);
	});

	it("from-ux exits on payload load error", async () => {
		mockLoadUxPayloadFile.mockRejectedValueOnce(new Error("bad file"));
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "samples", "from-ux-string", "--file", "bad.json"]),
		).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});
});
