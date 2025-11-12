export async function toBuffer(data: unknown): Promise<Buffer> {
	// Normalizes Blob | ArrayBuffer | Buffer | string -> Buffer
	if (data == null) return Buffer.alloc(0);

	// Node 18+ has Blob globally
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		const ab = await data.arrayBuffer();
		return Buffer.from(ab);
	}
	if (data instanceof ArrayBuffer) return Buffer.from(data);
	if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(data)) return data as Buffer;
	if (typeof data === "string") return Buffer.from(data, "utf8");

	const maybe = data as any;
	if (maybe?.data instanceof ArrayBuffer) return Buffer.from(maybe.data);

	throw new Error("Unsupported binary type for download");
}
