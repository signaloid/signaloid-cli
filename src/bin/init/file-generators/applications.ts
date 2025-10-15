import ejs from "ejs";
import path from "path";
import fs from "fs/promises";

export interface DemoApplicationDetails {
	title: string;
	description: string;
	repoUrl: string;
	coreId: string;
	commit: string;
	branch: string;
	buildDirectory: string;
	defaultArguments: string;
}

export async function generateDemoApplicationsContent(details: DemoApplicationDetails): Promise<string> {
	// Resolve the path to the template relative to the current file
	const templatePath = path.join(__dirname, "..", "templates", "demo.applications.ts.ejs");
	const template = await fs.readFile(templatePath, "utf-8");
	return ejs.render(template, details);
}
