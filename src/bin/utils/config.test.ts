import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const freshImport = async () => {
	jest.resetModules();
	return await import("./config");
};

describe("utils/config", () => {
	let tmpDir: string;
	let cfgFile: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signaloid-cli-test-"));
		process.env.SIGNALOID_CONFIG_DIR = tmpDir;
		cfgFile = path.join(tmpDir, "config.json");
	});

	afterEach(async () => {
		delete process.env.SIGNALOID_CONFIG_DIR;
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	});

	it("loadConfig creates empty file and returns {}", async () => {
		const { loadConfig } = await freshImport();
		const cfg = await loadConfig();
		expect(cfg).toEqual({});
		const data = JSON.parse(await fs.readFile(cfgFile, "utf8"));
		expect(data).toEqual({});
	});

	it("saveConfig writes with correct content and permissions, then loadConfig reads it", async () => {
		const { saveConfig, loadConfig } = await freshImport();
		const input = {
			profile: "default",
			env: "production" as const,
			apiEndpoint: "https://api.example.com",
			auth: { mode: "apikey" as const, apiKey: "secret" },
		};
		await saveConfig(input);
		const loaded = JSON.parse(await fs.readFile(cfgFile, "utf8"));
		expect(loaded).toEqual(input);
		const stat = await fs.stat(cfgFile);
		if (process.platform !== "win32") {
			expect(stat.mode & 0o777).toBe(0o600);
			const dirStat = await fs.stat(tmpDir);
			expect(dirStat.mode & 0o777).toBe(0o700);
		}
		const cfg2 = await loadConfig();
		expect(cfg2).toEqual(input);
	});

	it("loadConfig creates config.json owner-only (0600) and the directory 0700", async () => {
		if (process.platform === "win32") return;
		const dir = path.join(tmpDir, "nested");
		process.env.SIGNALOID_CONFIG_DIR = dir;
		const { loadConfig } = await freshImport();
		await loadConfig();
		expect((await fs.stat(path.join(dir, "config.json"))).mode & 0o777).toBe(0o600);
		expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
	});

	it("saveConfig tightens an existing config.json to 0600", async () => {
		if (process.platform === "win32") return;
		await fs.writeFile(cfgFile, "{}", { mode: 0o664 });
		await fs.chmod(cfgFile, 0o664);
		const { saveConfig } = await freshImport();
		await saveConfig({ auth: { mode: "apikey", apiKey: "secret" } });
		expect((await fs.stat(cfgFile)).mode & 0o777).toBe(0o600);
	});

	it("loadConfig returns existing config content", async () => {
		const content = { profile: "p1", env: "custom" };
		await fs.mkdir(tmpDir, { recursive: true });
		await fs.writeFile(cfgFile, JSON.stringify(content), { mode: 0o600 });
		const { loadConfig } = await freshImport();
		const cfg = await loadConfig();
		expect(cfg).toEqual(content);
	});
});
