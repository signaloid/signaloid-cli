import { resolveDownloadFilename } from "./download-filename";

const headers = (contentDisposition?: string): Headers => {
	const h = new Headers();
	if (contentDisposition) h.set("content-disposition", contentDisposition);
	return h;
};

const URL_WITH_KEY = "https://bucket.s3.amazonaws.com/bld_abc123/bld_abc123.bin?X-Amz-Signature=deadbeef";

describe("resolveDownloadFilename", () => {
	it("uses the filename the server sends in content-disposition", () => {
		const name = resolveDownloadFilename(headers('attachment; filename="bld_abc123.bin"'), URL_WITH_KEY, "fb.bin");

		expect(name).toBe("bld_abc123.bin");
	});

	it("accepts an unquoted content-disposition filename", () => {
		const name = resolveDownloadFilename(headers("attachment; filename=bld_abc123.bin"), URL_WITH_KEY, "fb.bin");

		expect(name).toBe("bld_abc123.bin");
	});

	it("prefers filename* when both forms are present", () => {
		const name = resolveDownloadFilename(
			headers("attachment; filename=\"legacy.bin\"; filename*=UTF-8''bld_abc123.bin"),
			URL_WITH_KEY,
			"fb.bin",
		);

		expect(name).toBe("bld_abc123.bin");
	});

	it("falls back to the object key in the URL when no header is sent", () => {
		const name = resolveDownloadFilename(headers(), URL_WITH_KEY, "fb.bin");

		expect(name).toBe("bld_abc123.bin");
	});

	it("falls back to the caller's name when the URL has no usable basename", () => {
		const name = resolveDownloadFilename(headers(), "https://bucket.s3.amazonaws.com/", "fb.bin");

		expect(name).toBe("fb.bin");
	});

	it("ignores a path in the server filename so it cannot escape the output directory", () => {
		const name = resolveDownloadFilename(
			headers('attachment; filename="../../etc/passwd"'),
			URL_WITH_KEY,
			"fb.bin",
		);

		expect(name).toBe("passwd");
	});

	it("falls back when the server filename is only path separators", () => {
		const name = resolveDownloadFilename(headers('attachment; filename="../.."'), URL_WITH_KEY, "fb.bin");

		expect(name).toBe("bld_abc123.bin");
	});

	it("falls back to the caller's name when the URL is unparseable", () => {
		const name = resolveDownloadFilename(headers(), "not-a-url", "fb.bin");

		expect(name).toBe("fb.bin");
	});
});
