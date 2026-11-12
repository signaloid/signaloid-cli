import { errorCodeOf, httpStatusOf } from "./http-error";

let level = 2; // default: full output

export const setVerbosity = (n: number) => {
	level = n;
};
export const getVerbosity = () => level;

/** Active at level >= 1. Data output to stdout (JSON / table). */
export const printData = (...args: Parameters<typeof console.log>) => {
	if (level >= 1) console.log(...args);
};

/** Active at level >= 1. Real error output — always shown except in fully silent mode. */
export const printError = (...args: Parameters<typeof console.error>) => {
	if (level >= 1) console.error(...args);
};

/** Active at level >= 2. Informational messages (e.g. "API key mode selected", "Hello!"). */
export const printInfo = (...args: Parameters<typeof console.error>) => {
	if (level >= 2) console.error(...args);
};

/** Active at level >= 2. Tip/suggestion messages (chalk.cyan / chalk.yellow blocks). */
export const printTip = (...args: Parameters<typeof console.error>) => {
	if (level >= 2) console.error(...args);
};

let debug = false;

/**
 * Keys never printed by --debug, at any depth: request headers carry credentials, and a
 * `config` or `request` (such as an axios error kept as an error's `details`) holds the headers.
 */
const HIDDEN_KEYS = new Set(["headers", "config", "request"]);

export const setDebug = (on: boolean) => {
	debug = on;
};

/**
 * Active with --debug. Prints what the CLI knows about an error on stderr: its stack,
 * its code and, for an HTTP error, the request method and URL, the status and the
 * response body. Request headers are never printed, because they carry credentials.
 */
export const printDebugError = (e: any) => {
	if (!debug || level < 1) return;
	// An SdkError carries the status and the response body (as `details`) but not the
	// request; an axios error carries `response` and `config`.
	const response = e?.response ?? e?.details?.response;
	const request = e?.config ?? e?.details?.config ?? response?.config;
	const status = httpStatusOf(e);
	const body = response ? response.data : e?.details;
	const lines: string[] = ["[debug]"];
	const code = errorCodeOf(e);
	if (code !== undefined) lines.push(`code: ${code}`);
	if (request?.method || request?.url) {
		const url = request.url ?? "";
		const base = request.baseURL && !/^https?:\/\//.test(url) ? request.baseURL : "";
		lines.push(`request: ${String(request.method ?? "").toUpperCase()} ${base}${url}`.trimEnd());
	}
	if (status !== undefined) lines.push(`status: ${status}`);
	if (body !== undefined) {
		let text: string;
		try {
			text =
				typeof body === "string"
					? body
					: JSON.stringify(body, (key, value) => (HIDDEN_KEYS.has(key) ? undefined : value));
		} catch {
			// Circular or BigInt data: debug output must never stop the caller from exiting.
			// Not String(body), which could include the hidden keys through a custom toString().
			text = "(not printable)";
		}
		lines.push(`response: ${text}`);
	}
	if (e?.stack) lines.push(String(e.stack));
	console.error(lines.join("\n"));
};
