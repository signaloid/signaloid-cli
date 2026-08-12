import path from "path";

/**
 * Picks the filename for a download, preferring what the server says.
 * Falls back to the object key in the URL, then to the caller's name.
 */
export function resolveDownloadFilename(headers: Headers, url: string, fallback: string): string {
	const fromHeader = filenameFromContentDisposition(headers.get("content-disposition"));
	if (fromHeader) {
		return fromHeader;
	}

	const fromUrl = filenameFromUrl(url);
	if (fromUrl) {
		return fromUrl;
	}

	return fallback;
}

function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) {
		return null;
	}

	const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
	if (extended) {
		return safeBasename(decodeURIComponentSafe(extended[1].trim()));
	}

	const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
	if (quoted) {
		return safeBasename(quoted[1]);
	}

	const bare = /filename\s*=\s*([^;]+)/i.exec(header);
	if (bare) {
		return safeBasename(bare[1].trim());
	}

	return null;
}

function filenameFromUrl(url: string): string | null {
	try {
		return safeBasename(decodeURIComponentSafe(new URL(url).pathname));
	} catch {
		return null;
	}
}

/** Strips any directory part so a server value cannot escape the output directory. */
function safeBasename(value: string): string | null {
	const base = path.basename(value.replace(/\\/g, "/").trim());
	if (base === "" || base === "." || base === "..") {
		return null;
	}
	return base;
}

function decodeURIComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
