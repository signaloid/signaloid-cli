import ora, { Ora } from "ora";
import { getVerbosity } from "./verbosity";

const noop = () => noopSpinner;
const noopSpinner = { succeed: noop, fail: noop, warn: noop, start: noop, stop: noop, text: "" };

export type Spinner = Ora | typeof noopSpinner;

/**
 * Creates an ora spinner that writes to stderr, keeping stdout clean for JSON data output.
 * Returns a noop spinner when verbosity < 2.
 */
export function createSpinner(text: string): Spinner {
	if (getVerbosity() < 2) return noopSpinner;
	return ora({ text, stream: process.stderr }).start();
}

/**
 * Creates a spinner that does not start immediately. Respects verbosity.
 */
export function createLazySpinner(): Spinner {
	if (getVerbosity() < 2) return noopSpinner;
	return ora({ stream: process.stderr });
}
