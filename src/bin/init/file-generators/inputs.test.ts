import { FileInputConfig, TextInputConfig } from "../models/input.models";
import { generateDemoInputsContent } from "./inputs";

const fileInput: FileInputConfig = {
	id: "sample-data",
	name: "Sample Data",
	argumentFlag: " -f ",
	type: "file",
	accept: ".csv",
	destination: "demo-inputs",
};

describe("generateDemoInputsContent", () => {
	it("declares the file input type and its config interface", async () => {
		const content = await generateDemoInputsContent([fileInput]);

		expect(content).toContain('| "file"');
		expect(content).toContain("export interface FileInputConfig extends BaseInputConfig");
		expect(content).toContain("accept: string;");
		expect(content).toContain("destination: string;");
	});

	it("renders a file input with its accept and destination", async () => {
		const content = await generateDemoInputsContent([fileInput]);

		expect(content).toContain('id: "sample-data"');
		expect(content).toContain("type: 'file'");
		expect(content).toContain('accept: ".csv"');
		expect(content).toContain('destination: "demo-inputs"');
	});

	it("leaves out the slider properties a file input does not have", async () => {
		const content = await generateDemoInputsContent([fileInput]);
		const entries = content.slice(content.indexOf("export const demoInputs"));

		expect(entries).not.toContain("initialValue");
		expect(entries).not.toContain("xAxisLabel");
	});

	it("separates a file input from the one after it", async () => {
		const textInput: TextInputConfig = {
			id: "seed",
			name: "Seed",
			argumentFlag: " -s ",
			type: "text-input",
			initialValue: "1",
		};

		const content = await generateDemoInputsContent([fileInput, textInput]);

		expect(content).toContain("},");
		expect(content).toContain('id: "seed"');
		expect(content.match(/type: 'file'/g)).toHaveLength(1);
	});

	it("renders an empty accept as an empty string", async () => {
		const content = await generateDemoInputsContent([{ ...fileInput, accept: "" }]);

		expect(content).toContain('accept: ""');
	});

	it("does not HTML-escape a name or destination", async () => {
		const content = await generateDemoInputsContent([{ ...fileInput, name: "R&D", destination: "R&D/samples" }]);

		expect(content).toContain('name: "R&D"');
		expect(content).toContain('destination: "R&D/samples"');
		expect(content).not.toContain("&amp;");
	});
	it("rejects an input whose type is not supported", async () => {
		const unknown = { ...fileInput, type: "spinner" } as unknown as FileInputConfig;

		await expect(generateDemoInputsContent([unknown])).rejects.toThrow(/Input 1 \('Sample Data'\).*'spinner'/);
	});

	it("rejects an input with no type at all", async () => {
		const untyped = { id: "a", name: "A", argumentFlag: " -a " } as unknown as FileInputConfig;

		await expect(generateDemoInputsContent([untyped])).rejects.toThrow(/Input 1/);
	});

	it("never renders an empty object for an input", async () => {
		const content = await generateDemoInputsContent([fileInput]);

		expect(content).not.toMatch(/\{\s*\}/);
	});

	it("accepts 'text' as the generated app spells a text input", async () => {
		const legacy = { id: "seed", name: "Seed", argumentFlag: " -s ", type: "text", initialValue: "1" };

		const content = await generateDemoInputsContent([legacy as never]);

		expect(content).toContain("type: 'text'");
		expect(content).toContain('initialValue: "1"');
	});
});
