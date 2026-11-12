import ora from "ora";

const succeed = jest.fn();
const fail = jest.fn();
const start = jest.fn(() => ({ succeed, fail }));

jest.mock("ora", () => ({
	__esModule: true,
	default: jest.fn(() => ({ start })),
}));

jest.mock("./config", () => ({
	loadConfig: jest.fn().mockResolvedValue({ auth: { mode: "apikey" } }),
}));

import { withErrorHandling, withErrorHandlingCustom, handleCliError, errorMessageOf } from "./error-handler";
import { EXIT_CODES } from "./exit-codes";

describe("error-handler utils", () => {
	const origExit = process.exit;
	const mockExit = jest.fn() as unknown as typeof process.exit;
	const mockErr = jest.spyOn(console, "error").mockImplementation(() => {});

	beforeAll(() => {
		process.exit = mockExit;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		succeed.mockClear();
		fail.mockClear();
		start.mockClear();
	});

	afterAll(() => {
		process.exit = origExit;
		mockErr.mockRestore();
	});

	it("withErrorHandling: success with message", async () => {
		const fn = jest.fn().mockResolvedValue("OK");
		const result = await withErrorHandling("Spinning...", "Done!", "Fail!", fn);
		expect(fn).toHaveBeenCalled();
		expect((ora as unknown as jest.Mock).mock.calls[0][0]).toMatchObject({ text: "Spinning..." });
		expect(start).toHaveBeenCalled();
		expect(succeed).toHaveBeenCalledWith("Done!");
		expect(fail).not.toHaveBeenCalled();
		expect(result).toBe("OK");
		expect(mockExit).not.toHaveBeenCalled();
	});

	it("withErrorHandling: success without message calls succeed()", async () => {
		const fn = jest.fn().mockResolvedValue(123);
		const result = await withErrorHandling("Load", undefined, "Fail!", fn);
		expect(succeed).toHaveBeenCalledWith();
		expect(result).toBe(123);
	});

	it("withErrorHandling: failure logs and exits(1)", async () => {
		const fn = jest.fn().mockRejectedValue(new Error("boom"));
		await withErrorHandling("Spin", "OK", "Failed run", fn);
		expect(fail).toHaveBeenCalledWith("Failed run");
		expect(mockErr).toHaveBeenCalledWith("boom");
		expect(mockExit).toHaveBeenCalledWith(1);
	});

	it("withErrorHandlingCustom: success passes result + spinner", async () => {
		const fn = jest.fn().mockResolvedValue("RES");
		const onSuccess = jest.fn();
		const result = await withErrorHandlingCustom("Spin", "Fail", fn, onSuccess);
		expect(fn).toHaveBeenCalled();
		expect(onSuccess).toHaveBeenCalledWith("RES", expect.objectContaining({ succeed, fail }));
		expect(result).toBe("RES");
		expect(mockExit).not.toHaveBeenCalled();
	});

	it("withErrorHandlingCustom: failure logs and exits(1)", async () => {
		const fn = jest.fn().mockRejectedValue(new Error("x"));
		const onSuccess = jest.fn();
		await withErrorHandlingCustom("Spin", "Bad", fn, onSuccess);
		expect(onSuccess).not.toHaveBeenCalled();
		expect(fail).toHaveBeenCalledWith("Bad");
		expect(mockErr).toHaveBeenCalledWith("x");
		expect(mockExit).toHaveBeenCalledWith(1);
	});

	it("handleCliError: SdkError with status 404 exits NOT_FOUND", async () => {
		// SdkError from the SDK carries the HTTP status on e.status
		const e = {
			name: "SdkError",
			code: "API_NOT_FOUND",
			message: "The requested Build was not found.",
			status: 404,
		};
		await handleCliError(e);
		expect(mockExit).toHaveBeenCalledWith(EXIT_CODES.NOT_FOUND);
	});

	it("handleCliError: axios-style response status 404 exits NOT_FOUND", async () => {
		const e = { message: "Not Found", response: { status: 404 } };
		await handleCliError(e);
		expect(mockExit).toHaveBeenCalledWith(EXIT_CODES.NOT_FOUND);
	});

	it("handleCliError: 403 exits AUTH with the unwrapped message", async () => {
		const e = {
			code: "API_FORBIDDEN",
			message: '{"error":"You cannot perform this action"}',
			status: 403,
		};
		await handleCliError(e);
		expect(mockExit).toHaveBeenNthCalledWith(1, EXIT_CODES.AUTH);
		expect(mockErr).toHaveBeenCalledWith("You cannot perform this action");
	});

	it("handleCliError: an SdkError with the generic axios message prints the API's error text", async () => {
		await handleCliError({
			name: "SdkError",
			code: "API_FORBIDDEN",
			message: "Request failed with status code 403",
			details: { error: "You cannot perform this action" },
			errorType: "You cannot perform this action",
			status: 403,
		});
		expect(mockErr).toHaveBeenCalledWith("You cannot perform this action");
	});

	it("errorMessageOf picks the most useful message", () => {
		expect(errorMessageOf({ message: "", details: { error: "quota exceeded" } })).toBe("quota exceeded");
		expect(errorMessageOf({ message: "Request failed with status code 500", errorType: "Boom" })).toBe("Boom");
		expect(errorMessageOf({ message: "Request failed with status code 500", details: {} })).toBe(
			"Request failed with status code 500",
		);
		expect(errorMessageOf({ message: "Specific", details: { error: "other" } })).toBe("Specific");
		expect(errorMessageOf({ message: "", details: "plain detail" })).toBe("plain detail");
		expect(errorMessageOf({ message: "", details: { message: "inner detail" } })).toBe("inner detail");
		expect(errorMessageOf({})).toBe("An error occurred");
	});

	it("errorMessageOf unwraps a JSON-string message and leaves others alone", () => {
		expect(errorMessageOf({ message: '{"message":"inner"}' })).toBe("inner");
		expect(errorMessageOf({ message: "plain" })).toBe("plain");
		expect(errorMessageOf({ message: "{not json" })).toBe("{not json");
	});

	it("handleCliError: 401 status exits AUTH", async () => {
		const e = { name: "SdkError", code: "API_UNAUTHORIZED", message: "Invalid API key.", status: 401 };
		await handleCliError(e);
		expect(mockExit).toHaveBeenCalledWith(EXIT_CODES.AUTH);
	});

	it("handleCliError: missing credentials (AUTH_NOT_LOGGED_IN) exit AUTH", async () => {
		const { notLoggedInError } = jest.requireActual("./sdk");
		await handleCliError(notLoggedInError("Not authenticated. Run `signaloid-cli auth login` first."));
		expect(mockExit).toHaveBeenCalledWith(EXIT_CODES.AUTH);
	});

	it("handleCliError: other errors exit ERROR", async () => {
		const e = { name: "SdkError", code: "API_SERVER_ERROR", message: "boom", status: 500 };
		await handleCliError(e);
		expect(mockExit).toHaveBeenCalledWith(EXIT_CODES.ERROR);
	});
});
