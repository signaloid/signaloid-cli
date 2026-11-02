import {
	validateEmail,
	validateISODate,
	validatePositiveInteger,
	validateNonNegativeInteger,
	validateNonEmptyString,
	validateURL,
	validateGitHubURL,
	validateEnum,
	assert as assertGuard,
	parseNumericOption,
	validateFilePath,
} from "./validation";

describe("validation utils", () => {
	describe("validateEmail", () => {
		it("accepts valid emails", () => {
			expect(validateEmail("user@example.com")).toBe(true);
			expect(validateEmail("u.ser+tag@sub.domain.co")).toBe(true);
		});
		it("rejects invalid emails", () => {
			expect(validateEmail("no-at-symbol")).toBe(false);
			expect(validateEmail("user@")).toBe(false);
			expect(validateEmail("@domain.com")).toBe(false);
			expect(validateEmail("user@domain")).toBe(false);
			expect(validateEmail("user@domain.")).toBe(false);
			expect(validateEmail(" user@example.com ")).toBe(false);
		});
	});

	describe("validateISODate", () => {
		it("accepts valid ISO dates", () => {
			expect(validateISODate("2030-01-01T00:00:00Z")).toBe(true);
			expect(validateISODate("2025-10-17")).toBe(true);
		});
		it("rejects invalid dates", () => {
			expect(validateISODate("not-a-date")).toBe(false);
			expect(validateISODate("")).toBe(false);
		});
	});

	describe("validatePositiveInteger", () => {
		it("accepts positive integers", () => {
			expect(validatePositiveInteger(1)).toBe(true);
			expect(validatePositiveInteger("42")).toBe(true);
		});
		it("rejects zero, negatives, and non-integers", () => {
			expect(validatePositiveInteger(0)).toBe(false);
			expect(validatePositiveInteger(-1)).toBe(false);
			expect(validatePositiveInteger("3.14")).toBe(false);
			expect(validatePositiveInteger("abc")).toBe(false);
		});
	});

	describe("validateNonNegativeInteger", () => {
		it("accepts non-negative integers", () => {
			expect(validateNonNegativeInteger(0)).toBe(true);
			expect(validateNonNegativeInteger(7)).toBe(true);
			expect(validateNonNegativeInteger("10")).toBe(true);
		});
		it("rejects negatives and non-integers", () => {
			expect(validateNonNegativeInteger(-1)).toBe(false);
			expect(validateNonNegativeInteger("2.5")).toBe(false);
			expect(validateNonNegativeInteger("x")).toBe(false);
		});
	});

	describe("validateNonEmptyString", () => {
		it("accepts non-empty trimmed strings", () => {
			expect(validateNonEmptyString("x")).toBe(true);
			expect(validateNonEmptyString("  y ")).toBe(true);
		});
		it("rejects empty or whitespace-only", () => {
			expect(validateNonEmptyString("")).toBe(false);
			expect(validateNonEmptyString("   ")).toBe(false);
			// @ts-expect-error
			expect(validateNonEmptyString(undefined)).toBe(false);
		});
	});

	describe("validateURL", () => {
		it("accepts valid URLs", () => {
			expect(validateURL("https://example.com")).toBe(true);
			expect(validateURL("http://localhost:8080/path?q=1")).toBe(true);
		});
		it("rejects invalid URLs", () => {
			expect(validateURL("not a url")).toBe(false);
			expect(validateURL("ftp://")).toBe(false);
		});
	});

	describe("validateGitHubURL", () => {
		it("accepts repo URLs", () => {
			expect(validateGitHubURL("https://github.com/org/repo")).toBe(true);
			expect(validateGitHubURL("https://github.com/org/repo/issues")).toBe(true);
		});
		it("rejects non-github or malformed", () => {
			expect(validateGitHubURL("https://gitlab.com/org/repo")).toBe(false);
			expect(validateGitHubURL("https://github.com/org")).toBe(false);
			expect(validateGitHubURL("not a url")).toBe(false);
		});
	});

	describe("validateEnum", () => {
		it("checks membership", () => {
			const allowed = ["a", "b", "c"] as const;
			expect(validateEnum("a", allowed)).toBe(true);
			expect(validateEnum("z" as any, allowed)).toBe(false);
		});
	});

	describe("assert (type guard)", () => {
		it("does not throw when condition is true", () => {
			expect(() => assertGuard(true, "msg")).not.toThrow();
		});
		it("throws when condition is false", () => {
			expect(() => assertGuard(false, "boom")).toThrow(/boom/);
		});
	});

	describe("parseNumericOption", () => {
		it("parses valid numbers", () => {
			expect(parseNumericOption("42")).toBe(42);
		});
		it("enforces min and max", () => {
			expect(() => parseNumericOption("5", 10)).toThrow(/at least 10/);
			expect(() => parseNumericOption("20", undefined, 10)).toThrow(/at most 10/);
		});
		it("throws on NaN", () => {
			expect(() => parseNumericOption("x")).toThrow(/Invalid number/);
		});
	});

	describe("validateFilePath", () => {
		it("accepts basic valid paths", () => {
			expect(validateFilePath("a/b/c.txt")).toBe(true);
			expect(validateFilePath("./file")).toBe(true);
		});
		it("rejects empty or with null bytes", () => {
			expect(validateFilePath("")).toBe(false);
			expect(validateFilePath("\0bad")).toBe(false);
		});
	});
});
