import fs from "node:fs/promises";
import path from "node:path";

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
