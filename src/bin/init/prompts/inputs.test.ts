const mockPrompt = jest.fn();
jest.mock("inquirer", () => ({
	__esModule: true,
	default: { prompt: (...args: any[]) => mockPrompt(...args) },
}));

import { FileInputConfig } from "../models/input.models";
import { normalizeDestination, promptForInputs, validateAcceptPatterns, validateDestination } from "./inputs";

describe("validateAcceptPatterns", () => {
	it("accepts an empty value", () => {
		expect(validateAcceptPatterns("")).toBe(true);
		expect(validateAcceptPatterns("   ")).toBe(true);
	});

	it("accepts extensions and MIME types", () => {
		expect(validateAcceptPatterns(".csv")).toBe(true);
		expect(validateAcceptPatterns("text/csv")).toBe(true);
		expect(validateAcceptPatterns("text/*")).toBe(true);
		expect(validateAcceptPatterns(".csv, .out, application/json")).toBe(true);
	});

	it("rejects a bare extension and names the two ways to fix it", () => {
		const message = validateAcceptPatterns("csv");

		expect(message).toContain("'.csv'");
		expect(message).toContain("'text/csv'");
	});

	it("rejects a list where only one pattern is malformed", () => {
		expect(validateAcceptPatterns(".out, csv")).toContain("'.csv'");
	});
});

describe("normalizeDestination", () => {
	it("trims surrounding whitespace", () => {
		expect(normalizeDestination("  demo-inputs  ")).toBe("demo-inputs");
	});

	it("strips leading and trailing slashes", () => {
		expect(normalizeDestination("/demo-inputs/")).toBe("demo-inputs");
		expect(normalizeDestination("///a/b///")).toBe("a/b");
	});

	it("keeps inner slashes", () => {
		expect(normalizeDestination("demo-inputs/samples")).toBe("demo-inputs/samples");
	});
});

describe("validateDestination", () => {
	it("accepts a nested destination", () => {
		expect(validateDestination("demo-inputs/samples")).toBe(true);
	});

	it("rejects a destination that normalizes to nothing", () => {
		expect(validateDestination("")).toContain("empty");
		expect(validateDestination("   ")).toContain("empty");
		expect(validateDestination("/")).toContain("empty");
	});

	it("rejects a destination that walks up the tree", () => {
		expect(validateDestination("..")).toContain("'..'");
		expect(validateDestination("demo-inputs/../../etc")).toContain("'..'");
	});
});

describe("promptForInputs", () => {
	beforeEach(() => {
		jest.spyOn(console, "log").mockImplementation(() => {});
	});

	it("builds a file input from the answers", async () => {
		mockPrompt
			.mockResolvedValueOnce({ numInputs: 1 })
			.mockResolvedValueOnce({ inputType: "file" })
			.mockResolvedValueOnce({ name: "Sample Data", argumentFlag: "-f" })
			.mockResolvedValueOnce({ accept: ".csv", destination: "demo-inputs" });

		const inputs = await promptForInputs();

		expect(inputs).toEqual([
			{
				id: "sample-data",
				name: "Sample Data",
				argumentFlag: " -f ",
				type: "file",
				accept: ".csv",
				destination: "demo-inputs",
			} satisfies FileInputConfig,
		]);
	});

	it("offers the file upload choice", async () => {
		mockPrompt
			.mockResolvedValueOnce({ numInputs: 1 })
			.mockResolvedValueOnce({ inputType: "file" })
			.mockResolvedValueOnce({ name: "Sample Data", argumentFlag: "-f" })
			.mockResolvedValueOnce({ accept: "", destination: "demo-inputs" });

		await promptForInputs();

		const typeQuestion = mockPrompt.mock.calls[1][0][0];
		expect(typeQuestion.choices).toContainEqual({ name: "File upload", value: "file" });
	});

	it("asks for the accepted types and the destination, in that order", async () => {
		mockPrompt
			.mockResolvedValueOnce({ numInputs: 1 })
			.mockResolvedValueOnce({ inputType: "file" })
			.mockResolvedValueOnce({ name: "Sample Data", argumentFlag: "-f" })
			.mockResolvedValueOnce({ accept: "", destination: "demo-inputs" });

		await promptForInputs();

		const fileQuestions = mockPrompt.mock.calls[3][0];
		expect(fileQuestions.map((question: { name: string }) => question.name)).toEqual(["accept", "destination"]);
		expect(fileQuestions[0].message).toContain(".csv");
		expect(fileQuestions[1].default).toBe("demo-inputs");
		expect(fileQuestions[1].validate).toBe(validateDestination);
	});
	it("pads the argument flag of a multiple choice input like every other type", async () => {
		mockPrompt
			.mockResolvedValueOnce({ numInputs: 1 })
			.mockResolvedValueOnce({ inputType: "multiple-choice" })
			.mockResolvedValueOnce({ name: "Mode", argumentFlag: "-m" })
			.mockResolvedValueOnce({ numberOfOptions: 1 })
			.mockResolvedValueOnce({ optionName: "Fast", optionValue: "fast" });

		const inputs = await promptForInputs();

		expect(inputs[0].argumentFlag).toBe(" -m ");
	});

	it("does not accept an empty or zero option count", async () => {
		mockPrompt
			.mockResolvedValueOnce({ numInputs: 1 })
			.mockResolvedValueOnce({ inputType: "multiple-choice" })
			.mockResolvedValueOnce({ name: "Mode", argumentFlag: "-m" })
			.mockResolvedValueOnce({ numberOfOptions: 1 })
			.mockResolvedValueOnce({ optionName: "Fast", optionValue: "fast" });

		await promptForInputs();

		const countQuestion = mockPrompt.mock.calls[3][0][0];
		expect(countQuestion.validate(undefined)).toEqual(expect.any(String));
		expect(countQuestion.validate(0)).toEqual(expect.any(String));
		expect(countQuestion.validate(2)).toBe(true);
	});
});
