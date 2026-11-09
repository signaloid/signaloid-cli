import {
	fetchWithPagination,
	finishListingSpinner,
	listByIds,
	mapWithConcurrency,
	paginatedOutput,
	printListingTable,
} from "./output";
import { setVerbosity } from "./verbosity";
import type { Spinner } from "./spinner";
import { paginationBlock } from "../test-utils/pagination";

// A page as the updated API returns it, with Pagination and the older ContinuationKey.
function page(items: unknown[], next?: string, continuationKey?: string) {
	return {
		Items: items,
		Pagination: paginationBlock(next),
		...(continuationKey && { ContinuationKey: continuationKey }),
	};
}

describe("utils/output fetchWithPagination", () => {
	it("makes one request without --count, and returns where to resume", async () => {
		const fetchFn = jest.fn().mockResolvedValueOnce(page([1, 2], "t1", "k1"));
		const result = await fetchWithPagination<number>(fetchFn, "Items");
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn).toHaveBeenCalledWith({});
		expect(result).toMatchObject({ items: [1, 2], next: { Cursor: "t1", ContinuationKey: "k1" } });
	});

	it("follows Next.Cursor across pages, asking only for the items still needed", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(page([1, 2], "t1"))
			.mockResolvedValueOnce(page([3], "t2"));
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 3 });
		expect(fetchFn.mock.calls.map(([query]) => query)).toEqual([{ limit: 3 }, { cursor: "t1", limit: 1 }]);
		expect(result).toMatchObject({ items: [1, 2, 3], next: { Cursor: "t2" } });
	});

	it("never asks for more than --limit per request", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(page([1, 2], "t1"))
			.mockResolvedValueOnce(page([3]));
		await fetchWithPagination<number>(fetchFn, "Items", { count: 10, limit: 2 });
		expect(fetchFn.mock.calls.map(([query]) => query.limit)).toEqual([2, 2]);
	});

	it("keeps paging past an empty page that has a Next", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(page([], "t1"))
			.mockResolvedValueOnce(page([1]));
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 1 });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ items: [1], next: {} });
	});

	it("starts from --cursor, or from the deprecated --start-key", async () => {
		const fetchFn = jest.fn().mockResolvedValue(page([1]));
		await fetchWithPagination<number>(fetchFn, "Items", { cursor: "t0" });
		await fetchWithPagination<number>(fetchFn, "Items", { startKey: "k0", limit: 5 });
		expect(fetchFn.mock.calls.map(([query]) => query)).toEqual([{ cursor: "t0" }, { startKey: "k0", limit: 5 }]);
	});

	it("follows ContinuationKey against an API without Pagination", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce({ Items: [1, 2], ContinuationKey: "c1" })
			.mockResolvedValueOnce({ Items: [3, 4] });
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 10 });
		expect(fetchFn.mock.calls[1][0]).toEqual({ startKey: "c1", limit: 8 });
		expect(result).toMatchObject({ items: [1, 2, 3, 4], next: {} });
	});

	it("keeps the items read, and reports the stall, when the API repeats a cursor", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce({ Items: [1], ContinuationKey: "same" })
			.mockResolvedValue({ Items: [2], ContinuationKey: "same" });
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 5 });
		expect(result).toMatchObject({ items: [1, 2], next: {}, stalled: expect.stringMatching(/same cursor twice/) });
	});

	it("finishListingSpinner fails the spinner, then prints the message, on a stall, and succeeds otherwise", () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		const calls: string[] = [];
		const spinner = {
			succeed: () => (calls.push("succeed"), spinner),
			fail: () => (calls.push("fail"), spinner),
		} as unknown as Spinner;
		error.mockImplementation(() => void calls.push("error"));
		finishListingSpinner(spinner, { stalled: "The API returned the same cursor twice." });
		expect(calls).toEqual(["fail", "error"]);
		// The listing was cut short, so the command must not exit as if it had ended.
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		calls.length = 0;
		finishListingSpinner(spinner, {});
		expect(calls).toEqual(["succeed"]);
		expect(process.exitCode).toBeUndefined();
		error.mockRestore();
	});

	it("stops after one request when the API echoes the --start-key back", async () => {
		const warn = jest.spyOn(console, "error").mockImplementation(() => {});
		const fetchFn = jest.fn().mockResolvedValue({ Items: [1], ContinuationKey: "k0" });
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 5, startKey: "k0" });
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(result.items).toEqual([1]);
		warn.mockRestore();
	});

	it("rethrows other errors", async () => {
		const fetchFn = jest.fn().mockRejectedValue(new Error("network"));
		await expect(fetchWithPagination<number>(fetchFn, "Items")).rejects.toThrow("network");
	});

	it("listByIds trims to --count and resumes after the last ID kept, when an older API returns too many", async () => {
		const listPage = jest.fn().mockResolvedValueOnce({ IDs: ["a", "b", "c"], ContinuationKey: "c" });
		const getOne = jest.fn(async (id: string) => ({ ID: id }));
		const result = await listByIds(listPage, "IDs", getOne, { count: 2 });
		expect(result).toMatchObject({ items: [{ ID: "a" }, { ID: "b" }], next: { ContinuationKey: "b" } });
		expect(getOne).toHaveBeenCalledTimes(2);
	});

	it("asks for full pages when the API filters after the limit, as with --status", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce(page([1], "t1"))
			.mockResolvedValueOnce(page([2, 3]));
		await fetchWithPagination<number>(fetchFn, "Items", { count: 3, filtersAfterLimit: true });
		expect(fetchFn.mock.calls.map(([query]) => query)).toEqual([{}, { cursor: "t1" }]);
	});

	it("returns every item read when an older API returns too many items that are not keys", async () => {
		const fetchFn = jest.fn().mockResolvedValueOnce({ Items: [1, 2, 3], ContinuationKey: "opaque" });
		const result = await fetchWithPagination<number>(fetchFn, "Items", { count: 2 });
		expect(result).toMatchObject({ items: [1, 2, 3], next: { ContinuationKey: "opaque" } });
	});

	it("paginatedOutput puts the items first, then their Count, then where to resume", () => {
		expect(paginatedOutput("Builds", { items: [1], next: { Cursor: "t" } })).toEqual({
			Builds: [1],
			Count: 1,
			Cursor: "t",
		});
	});

	it("listByIds keeps a Cursor rather than trim the IDs to a ContinuationKey", async () => {
		const listPage = jest.fn().mockResolvedValueOnce(page(["a", "b", "c"], "t1"));
		const result = await listByIds(listPage, "Items", async (id: string) => id.toUpperCase(), { count: 2 });
		expect(result).toEqual({ items: ["A", "B", "C"], next: { Cursor: "t1" } });
	});

	it("mapWithConcurrency keeps the order and never exceeds the limit", async () => {
		let inFlight = 0;
		let peak = 0;
		const result = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, n));
			inFlight--;
			return n * 10;
		});
		expect(result).toEqual([50, 10, 40, 20, 30]);
		expect(peak).toBe(2);
	});
});

describe("utils/output printListingTable", () => {
	let log: jest.SpyInstance;
	let error: jest.SpyInstance;
	beforeEach(() => {
		log = jest.spyOn(console, "log").mockImplementation(() => {});
		error = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		jest.restoreAllMocks();
		setVerbosity(2);
	});
	const keys = [{ KeyID: "key_1", Name: "first" }];

	it("prints the table on stdout, then how to resume on stderr, when more items remain", () => {
		printListingTable("keys", { items: keys, next: { Cursor: "t1" } });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain("key_1");
		expect(error).toHaveBeenCalledWith("More items: --cursor t1");
	});

	it("names --start-key for an API that sends only ContinuationKey", () => {
		printListingTable("keys", { items: keys, next: { ContinuationKey: "k1" } });
		expect(error).toHaveBeenCalledWith("More items: --start-key k1");
	});

	it("adds nothing on stderr on the last page", () => {
		printListingTable("keys", { items: keys, next: {} });
		expect(log).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
	});

	it("follows the verbosity, as the spinner does", () => {
		setVerbosity(1);
		printListingTable("keys", { items: keys, next: { Cursor: "t1" } });
		expect(log).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
	});
});

describe("utils/output resume keys", () => {
	it("leaves out ContinuationKey for a listing without --start-key", async () => {
		const fetchFn = jest.fn().mockResolvedValue(page([1], "t1", "k1"));
		const result = await fetchWithPagination<number>(fetchFn, "Items", { continuationKey: false });
		expect(result.next).toEqual({ Cursor: "t1" });
		const old = jest.fn().mockResolvedValue({ Items: [1], ContinuationKey: "k1" });
		expect((await fetchWithPagination<number>(old, "Items", { continuationKey: false })).next).toEqual({});
	});

	it("refuses --cursor against an engine without Pagination, rather than show the first page again", async () => {
		const fetchFn = jest.fn().mockResolvedValue({ Items: [1], ContinuationKey: "k1" });
		await expect(fetchWithPagination<number>(fetchFn, "Items", { cursor: "t1" })).rejects.toThrow(
			/does not take --cursor/,
		);
	});

	it("listByIds gives a stalled listing no ContinuationKey, even when it trims the IDs", async () => {
		const listPage = jest
			.fn()
			.mockResolvedValueOnce({ Items: ["a", "b", "c"], ContinuationKey: "same" })
			.mockResolvedValue({ Items: ["d"], ContinuationKey: "same" });
		const result = await listByIds(listPage, "Items", async (id: string) => id, { count: 5 });
		expect(result.stalled).toMatch(/same cursor twice/);
		expect(result.next).toEqual({});
	});
});
