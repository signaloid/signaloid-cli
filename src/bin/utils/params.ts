import fs from "node:fs/promises";
import path from "node:path";
import type { PlotRequest } from "@signaloid/scce-sdk";

export function parseKeyVals(pairs: string[]): Record<string, string> {
	const obj: Record<string, string> = {};
	for (const p of pairs || []) {
		const i = p.indexOf("=");
		if (i <= 0) throw new Error(`Invalid --param "${p}". Use key=value.`);
		const k = p.slice(0, i).trim();
		const v = p.slice(i + 1).trim();
		if (!k) throw new Error(`Invalid --param "${p}". Empty key.`);
		obj[k] = v;
	}
	return obj;
}

export async function loadJsonIfPath(file?: string): Promise<any | undefined> {
	if (!file) return undefined;
	const abs = path.resolve(file);
	const txt = await fs.readFile(abs, "utf8");
	return JSON.parse(txt);
}

/**
 * Reads the Ux payload from a `--file` given to `plot ux-string` or `samples from-ux-string`.
 * The file holds a JSON object with a `Payload` field, which is a Ux string or, unless
 * `uxStringOnly` is set, a list of numeric samples. Files written for older releases use
 * `payload`, which is still read.
 */
export async function loadUxPayloadFile(file: string, options: { uxStringOnly: true }): Promise<string>;
export async function loadUxPayloadFile(
	file: string,
	options?: { uxStringOnly?: boolean },
): Promise<PlotRequest["Payload"]>;
export async function loadUxPayloadFile(
	file: string,
	options: { uxStringOnly?: boolean } = {},
): Promise<PlotRequest["Payload"]> {
	const json = await loadJsonIfPath(file);
	const payload = json?.Payload ?? json?.payload;
	if (typeof payload === "string") {
		return payload;
	}
	if (!options.uxStringOnly && Array.isArray(payload) && payload.every((v) => typeof v === "number")) {
		return payload;
	}
	const expected = options.uxStringOnly ? "a Ux string" : "a Ux string or a list of numbers";
	throw new Error(`${file} must hold a JSON object with a "Payload" field: ${expected}.`);
}
