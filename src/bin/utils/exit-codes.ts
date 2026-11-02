import { printError } from "./verbosity";

// Uniform CLI exit codes. An empty result is a success (0), not an error.
export const EXIT_CODES = {
	SUCCESS: 0,
	ERROR: 1,
	USAGE: 2,
	AUTH: 3,
	NOT_FOUND: 4,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Reports a usage error on stderr and sets exit code 2. The caller returns afterwards. */
export function usageError(message: string): void {
	printError(message);
	process.exitCode = EXIT_CODES.USAGE;
}
