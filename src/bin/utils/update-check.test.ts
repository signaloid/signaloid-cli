import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const freshImport = async () => {
	jest.resetModules();
	return await import("./update-check");
};

describe("utils/update-check", () => {
	describe("isNewerVersion", () => {
		it("returns true when latest is a newer patch, minor, or major", async () => {
			const { isNewerVersion } = await freshImport();
			expect(isNewerVersion("2.1.1", "2.1.0")).toBe(true);
			expect(isNewerVersion("2.2.0", "2.1.5")).toBe(true);
			expect(isNewerVersion("3.0.0", "2.9.9")).toBe(true);
		});

		it("returns false when latest is equal or older", async () => {
			const { isNewerVersion } = await freshImport();
			expect(isNewerVersion("2.1.0", "2.1.0")).toBe(false);
			expect(isNewerVersion("2.0.9", "2.1.0")).toBe(false);
			expect(isNewerVersion("1.9.9", "2.0.0")).toBe(false);
		});

		it("treats a stable release as newer than its prerelease", async () => {
			const { isNewerVersion } = await freshImport();
			expect(isNewerVersion("2.2.0", "2.2.0-rc.2")).toBe(true);
			expect(isNewerVersion("2.2.0-rc.2", "2.2.0")).toBe(false);
		});

		it("orders prereleases of the same base version", async () => {
			const { isNewerVersion } = await freshImport();
			expect(isNewerVersion("2.2.0-rc.3", "2.2.0-rc.2")).toBe(true);
			expect(isNewerVersion("2.2.0-rc.2", "2.2.0-rc.3")).toBe(false);
			expect(isNewerVersion("2.2.0-rc.10", "2.2.0-rc.9")).toBe(true);
		});

		it("returns false for unparseable versions", async () => {
			const { isNewerVersion } = await freshImport();
			expect(isNewerVersion("not-a-version", "2.1.0")).toBe(false);
			expect(isNewerVersion("2.1.0", "garbage")).toBe(false);
			expect(isNewerVersion("", "")).toBe(false);
		});
	});

	describe("shouldNotify", () => {
		const base = {
			jsonOutput: false,
			verbosity: 2,
			isTTY: true,
			env: {} as NodeJS.ProcessEnv,
		};

		it("allows the notice in an interactive session", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify(base)).toBe(true);
		});

		it("stays silent with --json output", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, jsonOutput: true })).toBe(false);
		});

		it("stays silent at reduced verbosity", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, verbosity: 1 })).toBe(false);
			expect(shouldNotify({ ...base, verbosity: 0 })).toBe(false);
		});

		it("stays silent when verbosity is not a number, like the rest of the CLI's info output", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, verbosity: NaN })).toBe(false);
		});

		it("stays silent when stderr is not a TTY", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, isTTY: false })).toBe(false);
		});

		it("stays silent in CI or when the opt-out variable is set", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, env: { CI: "true" } })).toBe(false);
			expect(shouldNotify({ ...base, env: { SIGNALOID_CLI_NO_UPDATE_CHECK: "1" } })).toBe(false);
		});

		it("stays silent when the common NO_UPDATE_NOTIFIER opt-out is set", async () => {
			const { shouldNotify } = await freshImport();
			expect(shouldNotify({ ...base, env: { NO_UPDATE_NOTIFIER: "1" } })).toBe(false);
		});
	});

	describe("cache", () => {
		let tmpDir: string;

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signaloid-cli-update-test-"));
			process.env.SIGNALOID_CONFIG_DIR = tmpDir;
		});

		afterEach(async () => {
			delete process.env.SIGNALOID_CONFIG_DIR;
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		});

		it("readUpdateCache returns {} when no cache file exists", async () => {
			const { readUpdateCache } = await freshImport();
			expect(await readUpdateCache()).toEqual({});
		});

		it("readUpdateCache returns {} when the cache file is corrupted", async () => {
			const { readUpdateCache } = await freshImport();
			await fs.writeFile(path.join(tmpDir, "update-check.json"), "not json");
			expect(await readUpdateCache()).toEqual({});
		});

		it.each(["null", "[]", "42", '"text"'])("readUpdateCache returns {} when the cache file holds %s", async (json) => {
			const { readUpdateCache } = await freshImport();
			await fs.writeFile(path.join(tmpDir, "update-check.json"), json);
			expect(readUpdateCache()).toEqual({});
		});

		it("readUpdateCache drops fields of the wrong type, so a bad lastChecked cannot stop refreshes", async () => {
			const { readUpdateCache } = await freshImport();
			await fs.writeFile(
				path.join(tmpDir, "update-check.json"),
				JSON.stringify({ latestVersion: 5, lastChecked: "yesterday" })
			);
			expect(readUpdateCache()).toEqual({});
		});

		it("writeUpdateCache then readUpdateCache round-trips, in its own file", async () => {
			const { writeUpdateCache, readUpdateCache } = await freshImport();
			await writeUpdateCache({ latestVersion: "2.3.0", lastChecked: 1000 });
			expect(await readUpdateCache()).toEqual({ latestVersion: "2.3.0", lastChecked: 1000 });
			// Must not touch config.json, which holds credentials
			await expect(fs.access(path.join(tmpDir, "config.json"))).rejects.toThrow();
			await expect(fs.access(path.join(tmpDir, "update-check.json"))).resolves.toBeUndefined();
		});

		it("shouldRefresh throttles to once per 24 hours", async () => {
			const { shouldRefresh } = await freshImport();
			const now = 1_000_000_000_000;
			const hour = 60 * 60 * 1000;
			expect(shouldRefresh({}, now)).toBe(true);
			expect(shouldRefresh({ lastChecked: now - hour }, now)).toBe(false);
			expect(shouldRefresh({ lastChecked: now - 25 * hour }, now)).toBe(true);
		});
	});

	describe("refreshUpdateCache", () => {
		let tmpDir: string;

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signaloid-cli-update-test-"));
			process.env.SIGNALOID_CONFIG_DIR = tmpDir;
		});

		afterEach(async () => {
			delete process.env.SIGNALOID_CONFIG_DIR;
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		});

		it("asks npm for the package's latest dist-tag and caches it", async () => {
			const { refreshUpdateCache, readUpdateCache } = await freshImport();
			// npm view resolves the scoped registry and auth from the user's
			// npm config, exactly like the install that put the CLI there
			const execFn = jest.fn().mockResolvedValue({ stdout: "2.5.0\n" });
			await refreshUpdateCache({ packageName: "@signaloid/example-cli", execFn, now: 42 });
			expect(execFn).toHaveBeenCalledWith(
				"npm",
				["view", "@signaloid/example-cli", "dist-tags.latest"],
				expect.anything()
			);
			expect(await readUpdateCache()).toEqual({ latestVersion: "2.5.0", lastChecked: 42 });
		});

		it("swallows npm failures without writing the cache", async () => {
			const { refreshUpdateCache, readUpdateCache } = await freshImport();
			const execFn = jest.fn().mockRejectedValue(new Error("npm ERR! 404"));
			await expect(
				refreshUpdateCache({ packageName: "@signaloid/example-cli", execFn, now: 42 })
			).resolves.toBeUndefined();
			expect(await readUpdateCache()).toEqual({});
		});

		it("ignores output that is not a version", async () => {
			const { refreshUpdateCache, readUpdateCache } = await freshImport();
			const execFn = jest.fn().mockResolvedValue({ stdout: "\n" });
			await refreshUpdateCache({ packageName: "@signaloid/example-cli", execFn, now: 42 });
			expect(await readUpdateCache()).toEqual({});
		});
	});

	describe("startUpdateCheck", () => {
		const hour = 60 * 60 * 1000;
		const now = 1_000_000_000_000;
		const opts = { currentVersion: "2.1.0", packageName: "@signaloid/example-cli", jsonOutput: false, verbosity: 2 };
		let tmpDir: string;
		let onSpy: jest.SpyInstance;

		const interactive = (spawnFn: jest.Mock) => ({ isTTY: true, env: {}, spawnFn, now });
		const fakeSpawn = () => {
			const child = Object.assign(new EventEmitter(), { unref: jest.fn() });
			return { spawnFn: jest.fn(() => child), unref: child.unref, child };
		};
		const exitListeners = () => onSpy.mock.calls.filter(([event]) => event === "exit");

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signaloid-cli-update-test-"));
			process.env.SIGNALOID_CONFIG_DIR = tmpDir;
			onSpy = jest.spyOn(process, "on").mockImplementation(() => process);
		});

		afterEach(async () => {
			onSpy.mockRestore();
			delete process.env.SIGNALOID_CONFIG_DIR;
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		});

		it("does not crash the command when the cache file holds null", async () => {
			const { startUpdateCheck } = await freshImport();
			await fs.writeFile(path.join(tmpDir, "update-check.json"), "null");
			const { spawnFn } = fakeSpawn();
			expect(() => startUpdateCheck(opts, interactive(spawnFn))).not.toThrow();
			expect(spawnFn).toHaveBeenCalled();
		});

		it("refreshes a stale cache in a detached process that does not hold the CLI open", async () => {
			const { startUpdateCheck } = await freshImport();
			const { spawnFn, unref } = fakeSpawn();
			startUpdateCheck(opts, interactive(spawnFn));
			expect(spawnFn).toHaveBeenCalledWith(
				process.execPath,
				[expect.stringMatching(/update-check-worker\.js$/), "@signaloid/example-cli"],
				expect.objectContaining({ detached: true, stdio: "ignore" })
			);
			expect(unref).toHaveBeenCalled();
		});

		it("does not crash the CLI when the detached process fails to start", async () => {
			const { startUpdateCheck } = await freshImport();
			const { spawnFn, child } = fakeSpawn();
			startUpdateCheck(opts, interactive(spawnFn));
			expect(() => child.emit("error", new Error("spawn EAGAIN"))).not.toThrow();
		});

		it("records the attempt before refreshing, so a failing check is not retried on every run", async () => {
			const { startUpdateCheck, readUpdateCache } = await freshImport();
			const { spawnFn } = fakeSpawn();
			startUpdateCheck(opts, interactive(spawnFn));
			expect(readUpdateCache()).toEqual({ lastChecked: now });

			startUpdateCheck(opts, interactive(spawnFn));
			expect(spawnFn).toHaveBeenCalledTimes(1);
		});

		it("keeps the cached version when it records an attempt", async () => {
			const { startUpdateCheck, writeUpdateCache, readUpdateCache } = await freshImport();
			writeUpdateCache({ latestVersion: "2.0.0", lastChecked: now - 25 * hour });
			startUpdateCheck(opts, interactive(fakeSpawn().spawnFn));
			expect(readUpdateCache()).toEqual({ latestVersion: "2.0.0", lastChecked: now });
		});

		it("prints the notice on exit when the cached version is newer", async () => {
			const { startUpdateCheck, writeUpdateCache } = await freshImport();
			writeUpdateCache({ latestVersion: "2.2.0", lastChecked: now - hour });
			const { spawnFn } = fakeSpawn();
			startUpdateCheck(opts, interactive(spawnFn));
			expect(exitListeners()).toHaveLength(1);
			expect(spawnFn).not.toHaveBeenCalled();
		});

		it("prints nothing when the cached version is not newer", async () => {
			const { startUpdateCheck, writeUpdateCache } = await freshImport();
			writeUpdateCache({ latestVersion: "2.1.0", lastChecked: now - hour });
			startUpdateCheck(opts, interactive(fakeSpawn().spawnFn));
			expect(exitListeners()).toHaveLength(0);
		});

		it("neither notifies nor refreshes when output is JSON", async () => {
			const { startUpdateCheck, writeUpdateCache } = await freshImport();
			writeUpdateCache({ latestVersion: "2.2.0", lastChecked: now - 25 * hour });
			const { spawnFn } = fakeSpawn();
			startUpdateCheck({ ...opts, jsonOutput: true }, interactive(spawnFn));
			expect(exitListeners()).toHaveLength(0);
			expect(spawnFn).not.toHaveBeenCalled();
		});
	});

	describe("formatUpdateNotice", () => {
		it("mentions both versions and the install command for the running package", async () => {
			const { formatUpdateNotice } = await freshImport();
			const notice = formatUpdateNotice("2.1.0", "2.2.0", "@signaloid/example-cli");
			expect(notice).toContain("2.1.0");
			expect(notice).toContain("2.2.0");
			expect(notice).toContain("npm install -g @signaloid/example-cli");
		});
	});
});
