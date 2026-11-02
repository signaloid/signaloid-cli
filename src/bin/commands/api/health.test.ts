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

jest.mock("../../utils/sdk", () => {
	const health = {
		getOverallHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ health }),
		mockHealthAPI: health,
	};
});

import healthCmd from "./health";
const { mockHealthAPI } = jest.requireMock("../../utils/sdk");

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
	healthCmd(program);
	return program;
};

describe("health CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
	});

	it("calls getOverallHealth and logs result", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "health"]);
		expect(mockHealthAPI.getOverallHealth).toHaveBeenCalled();
		expect(exitCode).toBeUndefined();
	});

	it("fails gracefully on error", async () => {
		mockHealthAPI.getOverallHealth.mockRejectedValueOnce(new Error("server down"));
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "health"])).rejects.toThrow(/EXIT/);
		expect(exitCode).toBe(1);
	});
});
