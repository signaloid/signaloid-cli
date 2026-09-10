// src/bin/init/file-generators/inputs.ts
import ejs from "ejs";
import path from "path";
import fs from "fs/promises";
import { InputConfig } from "../prompts/inputs";
import { InputType, inputTypeMap } from "../models/input.models";

const supportedTypes = Object.keys(inputTypeMap) as InputType[];

// The generated app spells a text input "text", so configs written from it come back with that name.
const typeAliases: Record<string, InputType> = { text: "text-input" };

export function resolveInputTypes(inputs: InputConfig[]): InputConfig[] {
	return inputs.map((input, index) => {
		const declared = (input as { type?: string })?.type;
		const type = (declared !== undefined && typeAliases[declared]) || declared;

		if (type === undefined || !supportedTypes.includes(type as InputType)) {
			const label = (input as { name?: string })?.name ?? "unnamed";
			throw new Error(
				`Input ${index + 1} ('${label}') has unsupported type '${declared}'. ` +
					`Supported types: ${supportedTypes.join(", ")}.`,
			);
		}

		return { ...input, type } as InputConfig;
	});
}

export async function generateDemoInputsContent(inputs: InputConfig[]): Promise<string> {
	const templatePath = path.join(__dirname, "..", "templates", "demo.inputs.ts.ejs");
	const template = await fs.readFile(templatePath, "utf-8");

	// Pass the data to the template with the key 'inputs' to match the updated template
	return ejs.render(template, { inputs: resolveInputTypes(inputs) });
}
