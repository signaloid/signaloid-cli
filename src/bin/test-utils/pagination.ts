// Fixtures for unit tests of paginated listings. tsconfig.build.json leaves this folder out of the CLI build.

/** A `Pagination` block as the API sends it, with a `Next` when `next` is given. */
export function paginationBlock(next?: string, limit = 25) {
	return {
		Limit: limit,
		Links: { First: { Href: "f" }, ...(next && { Next: { Href: "n", Cursor: next } }) },
	};
}
