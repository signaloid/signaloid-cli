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

jest.mock("../../utils/fsx", () => ({
	writeBinary: jest.fn(),
	webReadableToBuffer: jest.fn().mockResolvedValue(Buffer.from("")),
}));

const mockLoadUxPayloadFile = jest.fn();
jest.mock("../../utils/params", () => ({
	...jest.requireActual("../../utils/params"),
	loadUxPayloadFile: jest.fn((...args) => mockLoadUxPayloadFile(...args)),
}));

jest.mock("../../utils/sdk", () => {
	const plotting = {
		plot: jest.fn().mockResolvedValue({ PlotID: "p1", PresignedURL: "https://example.invalid/p1.png" }),
		plotValue: jest.fn().mockResolvedValue({ PlotID: "p2", PresignedURL: "https://example.invalid/p2.png" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ plotting }),
		mockPlottingAPI: plotting,
	};
});

import plotCmd from "./plot";
const { mockPlottingAPI } = jest.requireMock("../../utils/sdk");

global.fetch = jest.fn().mockResolvedValue({ body: {} }) as any;
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(process, "exit").mockImplementation((() => {
	throw new Error("EXIT");
}) as any);

const makeProgram = () => {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({ writeOut() {}, writeErr() {} });
	plotCmd(program);
	return program;
};

const run = (args: string[]) => makeProgram().parseAsync(["node", "x", "plot", ...args]);

const plotOptionFlags = [
	"--x-axis-label",
	"Voltage (V)",
	"--x-lim-min",
	"-1",
	"--x-lim-max",
	"4",
	"--y-lim-min",
	"0",
	"--y-lim-max",
	"0.75",
];

const expectedPlotOptions = {
	xAxisLabel: "Voltage (V)",
	xLimMin: -1,
	xLimMax: 4,
	yLimMin: 0,
	yLimMax: 0.75,
};

describe("plot CLI options", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("ux-string passes label and numeric limits to plot() as options", async () => {
		await run(["ux-string", "--ux-string", "1.0Ux0001", ...plotOptionFlags]);
		expect(mockPlottingAPI.plot).toHaveBeenCalledWith("1.0Ux0001", expectedPlotOptions);
	});

	it("ux-string --file passes the loaded payload and options to plot()", async () => {
		mockLoadUxPayloadFile.mockResolvedValue("2.0Ux0002");
		await run(["ux-string", "--file", "payload.json", ...plotOptionFlags]);
		expect(mockLoadUxPayloadFile).toHaveBeenCalledWith("payload.json");
		expect(mockPlottingAPI.plot).toHaveBeenCalledWith("2.0Ux0002", expectedPlotOptions);
	});

	it("value-id passes label and numeric limits to plotValue() as the third argument", async () => {
		await run(["value-id", "--task-id", "t1", "--value-id", "v1", ...plotOptionFlags]);
		expect(mockPlottingAPI.plotValue).toHaveBeenCalledWith("t1", "v1", expectedPlotOptions);
	});

	it("accepts a negative decimal limit as a number", async () => {
		await run(["ux-string", "--ux-string", "1.0Ux0001", "--x-lim-min", "-2.5"]);
		expect(mockPlottingAPI.plot).toHaveBeenCalledWith("1.0Ux0001", expect.objectContaining({ xLimMin: -2.5 }));
	});

	it("rejects a non-numeric limit as a usage error without calling the SDK", async () => {
		const error = await run(["ux-string", "--ux-string", "1.0Ux0001", "--y-lim-max", "abc"]).then(
			() => undefined,
			(e) => e,
		);
		expect(error?.code).toBe("commander.invalidArgument");
		expect(mockPlottingAPI.plot).not.toHaveBeenCalled();
	});
});
