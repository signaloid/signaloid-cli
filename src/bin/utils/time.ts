export function parseDuration(input: string): number {
	const regex = /^(\d+)\s*(d|day|days|h|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)$/i;
	const match = input.trim().match(regex);

	if (!match) {
		throw new Error(`Invalid duration format: ${input}. Use formats like 7d, 12h, 30m, 45s.`);
	}

	const value = parseInt(match[1], 10);
	const unit = match[2].toLowerCase();

	const multipliers: Record<string, number> = {
		d: 24 * 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		days: 24 * 60 * 60 * 1000,

		h: 60 * 60 * 1000,
		hour: 60 * 60 * 1000,
		hours: 60 * 60 * 1000,

		m: 60 * 1000,
		min: 60 * 1000,
		mins: 60 * 1000,
		minute: 60 * 1000,
		minutes: 60 * 1000,

		s: 1000,
		sec: 1000,
		secs: 1000,
		second: 1000,
		seconds: 1000,
	};

	return value * multipliers[unit];
}
