let level = 2; // default: full output

export const setVerbosity = (n: number) => {
	level = n;
};
export const getVerbosity = () => level;

/** Active at level >= 1. Data output to stdout (JSON / table). */
export const printData = (...args: Parameters<typeof console.log>) => {
	if (level >= 1) console.log(...args);
};

/** Active at level >= 1. Real error output — always shown except in fully silent mode. */
export const printError = (...args: Parameters<typeof console.error>) => {
	if (level >= 1) console.error(...args);
};

/** Active at level >= 2. Informational messages (e.g. "API key mode selected", "Hello!"). */
export const printInfo = (...args: Parameters<typeof console.error>) => {
	if (level >= 2) console.error(...args);
};

/** Active at level >= 2. Tip/suggestion messages (chalk.cyan / chalk.yellow blocks). */
export const printTip = (...args: Parameters<typeof console.error>) => {
	if (level >= 2) console.error(...args);
};
