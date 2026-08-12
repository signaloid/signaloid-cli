import fs from "fs/promises";
import path from "path";

export interface WebAppConfig {
	applicationDetails: unknown;
	inputs: unknown;
}

// Reads the persisted signaloid.config.json, or throws for projects created before it existed.
export async function exportWebAppConfig(projectDir: string): Promise<WebAppConfig> {
	const resolved = path.resolve(projectDir);

	const configPath = path.join(resolved, "signaloid.config.json");
	const raw = await fs.readFile(configPath, "utf-8").catch(() => null);
	if (raw !== null) {
		let parsed: any;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error(`'${configPath}' is not valid JSON. The project config file is corrupted.`);
		}
		if (parsed && parsed.applicationDetails !== undefined && parsed.inputs !== undefined) {
			return { applicationDetails: parsed.applicationDetails, inputs: parsed.inputs };
		}
		throw new Error(
			`'${configPath}' is missing 'applicationDetails' or 'inputs'. The project config file is malformed.`,
		);
	}

	// No persisted config, so check whether this is even a web-app project.
	const modelsDir = path.join(resolved, "src", "app", "models");
	const looksLikeProject = await fs
		.stat(path.join(modelsDir, "demo.inputs.ts"))
		.then(() => true)
		.catch(() => false);

	if (looksLikeProject) {
		throw new Error(
			`No signaloid.config.json found in '${resolved}'. This project was created before ` +
				`config export was supported. Re-run 'signaloid-cli init web-app --json-output <path>' ` +
				`to regenerate the configuration.`,
		);
	}

	throw new Error(`No web-app project found in '${resolved}'. Expected a signaloid.config.json file.`);
}
