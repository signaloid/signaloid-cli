import { fetchWithPagination } from "./output";

describe("utils/output fetchWithPagination", () => {
	it("follows ContinuationKey across pages", async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce({ Items: [1, 2], ContinuationKey: "c1" })
			.mockResolvedValueOnce({ Items: [3, 4] });
		const result = await fetchWithPagination<number>(fetchFn, "Items", 10);
		expect(fetchFn).toHaveBeenNthCalledWith(2, "c1");
		expect(result).toEqual({ items: [1, 2, 3, 4], continuationKey: undefined });
	});
});
