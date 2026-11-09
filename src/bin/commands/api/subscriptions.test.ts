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
	const subscriptions = {
		get: jest.fn().mockResolvedValue({ plan: "basic" }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ subscriptions }),
		mockSubscriptionsAPI: subscriptions,
	};
});

import subscriptionsCmd from "./subscriptions";
const { mockSubscriptionsAPI } = jest.requireMock("../../utils/sdk");

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
	subscriptionsCmd(program);
	return program;
};

describe("subscriptions CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		exitCode = undefined;
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "subscriptions", "get"]);
		expect(mockSubscriptionsAPI.get).toHaveBeenCalled();
	});
});
