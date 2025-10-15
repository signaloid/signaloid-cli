// src/bin/init/file-generators/inputs.ts
import ejs from "ejs";
import path from "path";
import fs from "fs/promises";
import { InputConfig } from "../prompts/inputs";

export async function generateDemoInputsContent(inputs: InputConfig[]): Promise<string> {
	const templatePath = path.join(__dirname, "..", "templates", "demo.inputs.ts.ejs");
	const template = await fs.readFile(templatePath, "utf-8");

	// Pass the data to the template with the key 'inputs' to match the updated template
	return ejs.render(template, { inputs: inputs });
}
