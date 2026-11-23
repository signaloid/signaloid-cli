import { getStopReason } from "@signaloid/scce-sdk";

type StatusDetails = Parameters<typeof getStopReason>[0];

/** How long to wait for the details that carry the stop reason before giving up on it. */
const STOP_REASON_TIMEOUT_MS = 5000;

/**
 * Adds the reason to a `Stopped` status, as in "Stopped (ErrMaxDurationExceeded)", so that a
 * run that went over its --max-duration can be told apart from other stops.
 *
 * Returns the status unchanged for any other status, when the details carry no reason, and when
 * fetching the details fails or takes longer than 5 seconds, because the status alone is still
 * worth reporting and a watch command must not hang on it.
 */
export async function describeFinalStatus(
	status: string,
	fetchDetails: () => Promise<StatusDetails>,
	timeoutMs = STOP_REASON_TIMEOUT_MS,
): Promise<string> {
	if (String(status).toLowerCase() !== "stopped") return status;
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<undefined>((resolve) => {
		timer = setTimeout(() => resolve(undefined), timeoutMs);
	});
	try {
		const details = await Promise.race([fetchDetails(), timeout]);
		const reason = details && getStopReason(details);
		return reason ? `${status} (${reason})` : status;
	} catch {
		return status;
	} finally {
		clearTimeout(timer);
	}
}
