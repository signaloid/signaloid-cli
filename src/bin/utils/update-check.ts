import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import chalk from "chalk";
import { configDir } from "./config";

export type UpdateCache = {
	latestVersion?: string;
	lastChecked?: number;
};

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 10_000;

const cacheFile = path.join(configDir, "update-check.json");

type ParsedVersion = {
	major: number;
	minor: number;
	patch: number;
	prerelease: string[];
};

const parseVersion = (version: string): ParsedVersion | null => {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
	if (!match) return null;
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		prerelease: match[4] ? match[4].split(".") : [],
	};
};

const comparePrerelease = (a: string[], b: string[]): number => {
	// Per semver: a version without prerelease identifiers ranks higher
	if (a.length === 0 && b.length === 0) return 0;
	if (a.length === 0) return 1;
	if (b.length === 0) return -1;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		if (a[i] === undefined) return -1;
		if (b[i] === undefined) return 1;
		const aNum = /^\d+$/.test(a[i]);
		const bNum = /^\d+$/.test(b[i]);
		if (aNum && bNum) {
			const diff = parseInt(a[i], 10) - parseInt(b[i], 10);
			if (diff !== 0) return diff;
		} else if (aNum !== bNum) {
			// Numeric identifiers rank lower than alphanumeric ones
			return aNum ? -1 : 1;
		} else if (a[i] !== b[i]) {
			return a[i] < b[i] ? -1 : 1;
		}
	}
	return 0;
};

/** True when `latest` is strictly newer than `current`. Unparseable input is never newer. */
export const isNewerVersion = (latest: string, current: string): boolean => {
	const a = parseVersion(latest);
	const b = parseVersion(current);
	if (!a || !b) return false;
	if (a.major !== b.major) return a.major > b.major;
	if (a.minor !== b.minor) return a.minor > b.minor;
	if (a.patch !== b.patch) return a.patch > b.patch;
	return comparePrerelease(a.prerelease, b.prerelease) > 0;
};

/**
 * The notice is only for interactive human sessions. Anything
 * machine-readable or scripted must stay byte-identical with older versions.
 */
export const shouldNotify = (opts: {
	jsonOutput: boolean;
	verbosity: number;
	isTTY: boolean;
	env: NodeJS.ProcessEnv;
}): boolean => {
	if (opts.jsonOutput) return false;
	if (!(opts.verbosity >= 2)) return false;
	if (!opts.isTTY) return false;
	if (opts.env.CI) return false;
	if (opts.env.SIGNALOID_CLI_NO_UPDATE_CHECK) return false;
	if (opts.env.NO_UPDATE_NOTIFIER) return false;
	return true;
};

/** Keeps only well-typed fields, so a hand-edited or corrupt cache reads as missing. */
export const readUpdateCache = (): UpdateCache => {
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
	} catch {
		return {};
	}
	if (typeof raw !== "object" || raw === null) return {};
	const { latestVersion, lastChecked } = raw as Record<string, unknown>;
	return {
		...(typeof latestVersion === "string" && { latestVersion }),
		...(typeof lastChecked === "number" && Number.isFinite(lastChecked) && { lastChecked }),
	};
};

export const writeUpdateCache = (cache: UpdateCache): void => {
	fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(cacheFile, JSON.stringify(cache));
};

export const shouldRefresh = (cache: UpdateCache, now: number): boolean => {
	if (!cache.lastChecked) return true;
	return now - cache.lastChecked > CHECK_INTERVAL_MS;
};

type ExecFn = (
	command: string,
	args: string[],
	options: { signal?: AbortSignal; shell?: boolean }
) => Promise<{ stdout: string }>;

const defaultExec: ExecFn = promisify(execFile);

/**
 * Ask npm for the latest published version of this package and cache it.
 * npm view resolves the scoped registry and its auth from the user's npm
 * config, exactly like the install that put the CLI there. So the internal
 * package checks GitHub Packages and the public one checks npmjs, with no
 * registry knowledge here. Never throws. Offline or slow networks and
 * missing registry auth must not affect the running command.
 */
export const refreshUpdateCache = async (opts: {
	packageName: string;
	execFn?: ExecFn;
	now?: number;
}): Promise<void> => {
	try {
		const execFn = opts.execFn ?? defaultExec;
		const { stdout } = await execFn("npm", ["view", opts.packageName, "dist-tags.latest"], {
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
			// npm is npm.cmd on Windows and needs a shell to resolve
			shell: process.platform === "win32",
		});
		const latest = stdout.trim();
		if (!latest) return;
		writeUpdateCache({ latestVersion: latest, lastChecked: opts.now ?? Date.now() });
	} catch {
		// Best effort only. A failed check must never surface to the user.
	}
};

export const formatUpdateNotice = (current: string, latest: string, packageName: string): string => {
	return (
		`\nA new version of the Signaloid CLI is available: ` +
		`${chalk.dim(current)} → ${chalk.green(latest)}\n` +
		`Run ${chalk.cyan(`npm install -g ${packageName}`)} to update.`
	);
};

type SpawnFn = (
	command: string,
	args: string[],
	options: { detached: boolean; stdio: "ignore"; windowsHide: boolean }
) => { on(event: "error", listener: () => void): unknown; unref(): void };

const workerFile = path.join(__dirname, "update-check-worker.js");

/**
 * Called once per invocation from the CLI entry point.
 * Notifies from the previous run's cache, then refreshes the cache in a
 * detached process that outlives the command, so the registry request never
 * delays exit. The attempt is recorded before the refresh starts, so a failing
 * check, or several commands run at once, still check at most once a day.
 */
export const startUpdateCheck = (
	opts: {
		currentVersion: string;
		packageName: string;
		jsonOutput: boolean;
		verbosity: number;
	},
	deps: { isTTY?: boolean; env?: NodeJS.ProcessEnv; spawnFn?: SpawnFn; now?: number } = {}
): void => {
	const notify = shouldNotify({
		jsonOutput: opts.jsonOutput,
		verbosity: opts.verbosity,
		isTTY: deps.isTTY ?? Boolean(process.stderr.isTTY),
		env: deps.env ?? process.env,
	});
	if (!notify) return;

	const cache = readUpdateCache();
	if (cache.latestVersion && isNewerVersion(cache.latestVersion, opts.currentVersion)) {
		const notice = formatUpdateNotice(opts.currentVersion, cache.latestVersion, opts.packageName);
		process.on("exit", () => console.error(notice));
	}

	const now = deps.now ?? Date.now();
	if (!shouldRefresh(cache, now)) return;
	try {
		writeUpdateCache({ ...cache, lastChecked: now });
		const spawnFn = deps.spawnFn ?? spawn;
		const child = spawnFn(process.execPath, [workerFile, opts.packageName], {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		});
		// Spawn failures arrive as an async event the catch below cannot see
		child.on("error", () => {});
		child.unref();
	} catch {
		// Best effort only. A failed check must never surface to the user.
	}
};
