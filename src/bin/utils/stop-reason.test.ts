import { describeFinalStatus } from "./stop-reason";

const stoppedWith = (Message: string) => async () => ({
	StatusTransitions: [{ Status: "Stopped" as const, Timestamp: 1, Message }],
});

describe("describeFinalStatus", () => {
	it("adds the reason to a Stopped status", async () => {
		await expect(
			describeFinalStatus("Stopped", stoppedWith("ErrMaxDurationExceeded: Your program ran longer than...")),
		).resolves.toBe("Stopped (ErrMaxDurationExceeded)");
	});

	it("leaves other statuses alone without fetching the details", async () => {
		const fetchDetails = jest.fn();
		await expect(describeFinalStatus("Completed", fetchDetails)).resolves.toBe("Completed");
		expect(fetchDetails).not.toHaveBeenCalled();
	});

	it("returns the status when the message carries no reason", async () => {
		await expect(describeFinalStatus("Stopped", stoppedWith("Task stopped."))).resolves.toBe("Stopped");
	});

	it("returns the status when the details take too long", async () => {
		await expect(describeFinalStatus("Stopped", () => new Promise(() => {}), 10)).resolves.toBe("Stopped");
	});

	it("returns the status when the details cannot be fetched", async () => {
		await expect(describeFinalStatus("Stopped", () => Promise.reject(new Error("network down")))).resolves.toBe(
			"Stopped",
		);
	});
});
