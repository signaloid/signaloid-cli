import fs from "fs/promises";
import path from "path";
import os from "os";
import { exportWebAppConfig } from "./export-config";

async function makeTmpDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "kea-export-"));
}

describe("exportWebAppConfig", () => {
	it("reads signaloid.config.json when present", async () => {
		const dir = await makeTmpDir();
		const cfg = { applicationDetails: { title: "Demo" }, inputs: [{ id: "a" }] };
		await fs.writeFile(path.join(dir, "signaloid.config.json"), JSON.stringify(cfg));

		const result = await exportWebAppConfig(dir);

		expect(result).toEqual(cfg);
	});

	it("throws a project-predates-support error when only generated models exist", async () => {
		const dir = await makeTmpDir();
		await fs.mkdir(path.join(dir, "src", "app", "models"), { recursive: true });
		await fs.writeFile(path.join(dir, "src", "app", "models", "demo.inputs.ts"), "export const demoInputs = [];");

		await expect(exportWebAppConfig(dir)).rejects.toThrow(/created before config export was supported/i);
	});

	it("throws a no-project error for an unrelated directory", async () => {
		const dir = await makeTmpDir();

		await expect(exportWebAppConfig(dir)).rejects.toThrow(/No web-app project found/i);
	});

	it("throws when the config file is malformed", async () => {
		const dir = await makeTmpDir();
		await fs.writeFile(path.join(dir, "signaloid.config.json"), JSON.stringify({ applicationDetails: {} }));

		await expect(exportWebAppConfig(dir)).rejects.toThrow(/missing 'applicationDetails' or 'inputs'/i);
	});
});
