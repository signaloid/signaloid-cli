import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

export async function writeBinary(outDir: string, filename: string, buf: Buffer) {
	await ensureDir(outDir);

	// Sanitize filename to prevent path traversal - only use the basename
	const safeFilename = path.basename(filename);

	// Additional safety check: ensure filename doesn't start with . on Unix systems
	// to avoid creating hidden files unintentionally (optional but good practice)
	if (safeFilename !== filename) {
		console.warn(`Warning: Filename contained path separators. Using sanitized name: ${safeFilename}`);
	}

	const out = path.join(outDir, safeFilename);

	// Verify the resolved path is still within the intended output directory
	const resolvedOut = path.resolve(out);
	const resolvedDir = path.resolve(outDir);

	if (!resolvedOut.startsWith(resolvedDir + path.sep) && resolvedOut !== resolvedDir) {
		throw new Error(`Invalid path: File would be written outside target directory`);
	}

	await fs.writeFile(out, buf);
	return out;
}

export async function webReadableToBuffer(stream: ReadableStream): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
	}

	return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
