import { printDebugError, setDebug } from "./verbosity";

describe("printDebugError", () => {
	const err = jest.spyOn(console, "error").mockImplementation(() => {});
	afterEach(() => {
		setDebug(false);
		err.mockClear();
	});

	it("prints nothing without --debug", () => {
		printDebugError(new Error("x"));
		expect(err).not.toHaveBeenCalled();
	});

	it("prints request, status and body, never headers", () => {
		setDebug(true);
		printDebugError({
			code: "API_FORBIDDEN",
			response: { status: 403, data: { error: "no" } },
			config: {
				method: "get",
				baseURL: "https://api.example",
				url: "/keys",
				headers: { Authorization: "scce_secret" },
			},
		});
		const out = err.mock.calls[0][0] as string;
		expect(out).toContain("request: GET https://api.example/keys");
		expect(out).toContain("status: 403");
		expect(out).toContain('response: {"error":"no"}');
		expect(out).not.toContain("scce_secret");
	});

	it("prints the status and body of an SdkError", () => {
		setDebug(true);
		printDebugError({ name: "SdkError", code: "API_FORBIDDEN", status: 403, details: { error: "no" } });
		const out = err.mock.calls[0][0] as string;
		expect(out).toContain("status: 403");
		expect(out).toContain('response: {"error":"no"}');
	});

	it("never prints headers kept in details without a response", () => {
		setDebug(true);
		printDebugError({
			name: "SdkError",
			code: "API_FATAL",
			details: {
				message: "socket hang up",
				config: { method: "get", url: "/keys", headers: { Authorization: "scce_secret" } },
				request: { _header: "Authorization: scce_secret" },
			},
		});
		const out = err.mock.calls[0][0] as string;
		expect(out).toContain("request: GET /keys");
		expect(out).toContain('response: {"message":"socket hang up"}');
		expect(out).not.toContain("scce_secret");
	});

	it("never prints headers nested in a response body", () => {
		setDebug(true);
		printDebugError({ response: { status: 500, data: { echo: { headers: { Authorization: "scce_secret" } } } } });
		expect(err.mock.calls[0][0]).not.toContain("scce_secret");
	});

	it("does not throw on a circular response body", () => {
		setDebug(true);
		const data: any = {};
		data.self = data;
		expect(() => printDebugError({ response: { status: 500, data } })).not.toThrow();
	});
});
