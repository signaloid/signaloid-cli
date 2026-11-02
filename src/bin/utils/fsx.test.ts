import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureDir, writeBinary, webReadableToBuffer } from "./fsx";

const makeTmp = async () => await fs.mkdtemp(path.join(os.tmpdir(), "fsx-test-"));

describe("utils/fsx", () => {
	let tmp: string;
	let warnSpy: jest.SpyInstance;

	beforeEach(async () => {
		tmp = await makeTmp();
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(async () => {
		warnSpy.mockRestore();
		await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
	});

	it("ensureDir creates nested directories", async () => {
		const dir = path.join(tmp, "a", "b", "c");
		await ensureDir(dir);
		const stat = await fs.stat(dir);
		expect(stat.isDirectory()).toBe(true);
	});

	it("writeBinary writes file and returns path", async () => {
		const outDir = path.join(tmp, "out");
		const p = await writeBinary(outDir, "file.bin", Buffer.from("abc"));
		expect(p).toBe(path.join(outDir, "file.bin"));
		const data = await fs.readFile(p, "utf8");
		expect(data).toBe("abc");
	});

	it("writeBinary sanitizes filename with path separators", async () => {
		const outDir = path.join(tmp, "o");
		const p = await writeBinary(outDir, "../evil.txt", Buffer.from("x"));
		expect(p).toBe(path.join(outDir, "evil.txt"));
		expect(warnSpy).toHaveBeenCalled();
		const data = await fs.readFile(p, "utf8");
		expect(data).toBe("x");
	});

	it("webReadableToBuffer concatenates chunks", async () => {
		const chunks = [Buffer.from("he"), Buffer.from("ll"), Buffer.from("o")];
		const stream: any = {
			getReader() {
				let i = 0;
				return {
					async read() {
						if (i < chunks.length) return { done: false, value: chunks[i++] };
						return { done: true, value: undefined };
					},
				};
			},
		};
		const buf = await webReadableToBuffer(stream);
		expect(buf.equals(Buffer.from("hello"))).toBe(true);
	});
});
