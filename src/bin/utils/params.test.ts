import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadUxPayloadFile } from "./params";

describe("loadUxPayloadFile", () => {
	let dir: string;
	const write = async (name: string, content: unknown) => {
		const file = path.join(dir, name);
		await fs.writeFile(file, JSON.stringify(content));
		return file;
	};

	beforeAll(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "ux-payload-"));
	});
	afterAll(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("reads a Ux string from Payload", async () => {
		expect(await loadUxPayloadFile(await write("a.json", { Payload: "1.0Ux0123" }))).toBe("1.0Ux0123");
	});

	it("reads a list of samples from Payload", async () => {
		expect(await loadUxPayloadFile(await write("b.json", { Payload: [1, 2.5] }))).toEqual([1, 2.5]);
	});

	it("still reads the lowercase payload of older files", async () => {
		expect(await loadUxPayloadFile(await write("c.json", { payload: "Ux00" }))).toBe("Ux00");
	});

	it("refuses a list of samples when only a Ux string will do", async () => {
		await expect(
			loadUxPayloadFile(await write("e.json", { Payload: [1, 2] }), { uxStringOnly: true }),
		).rejects.toThrow(/"Payload" field: a Ux string\./);
	});

	it("refuses a file without a usable Payload", async () => {
		await expect(loadUxPayloadFile(await write("d.json", { Payload: { nested: true } }))).rejects.toThrow(
			/must hold a JSON object with a "Payload" field/,
		);
	});
});
