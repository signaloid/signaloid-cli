import { Command } from "commander";

jest.mock("../../utils/config", () => ({
	loadConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("ora", () => ({
	__esModule: true,
	default: () => ({
		start: () => ({ succeed: () => ({}) as any, fail: () => ({}) as any }),
		succeed: () => ({}) as any,
		fail: () => ({}) as any,
	}),
}));

jest.mock("../../utils/sdk", () => {
	const organizations = { listUsers: jest.fn() };
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ organizations }),
		mockOrganizationsAPI: organizations,
	};
});

import organizationsCmd from "./organizations";
import { paginationBlock } from "../../test-utils/pagination";
const { mockOrganizationsAPI } = jest.requireMock("../../utils/sdk");

jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(process, "exit").mockImplementation((() => {
	throw new Error("EXIT");
}) as any);

const ORG_ID = "org_0123456789abcdef0123456789abcdef";

/** One page of users, with a `Next` link when `next` is given. */
function page(emails: string[], next?: string) {
	return {
		Users: emails.map((Email) => ({ Email })),
		Count: emails.length,
		Pagination: paginationBlock(next, 100),
	};
}

const run = async (...args: string[]) => {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({ writeOut() {}, writeErr() {} });
	organizationsCmd(program);
	await program.parseAsync(["node", "x", "organizations", "users", "list", "--org-id", ORG_ID, ...args]);
	const log = jest.mocked(console.log);
	return JSON.parse(log.mock.calls[log.mock.calls.length - 1][0]);
};

describe("organizations users list", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.exitCode = undefined;
	});

	it("fetches one page of active members by default, and ends with the Cursor to resume", async () => {
		mockOrganizationsAPI.listUsers.mockResolvedValueOnce(page(["a@example.com"], "tok1"));
		const printed = await run();
		expect(mockOrganizationsAPI.listUsers).toHaveBeenCalledTimes(1);
		expect(mockOrganizationsAPI.listUsers).toHaveBeenCalledWith(ORG_ID, { status: "Active" });
		expect(printed).toEqual({ Users: [{ Email: "a@example.com" }], Count: 1, Cursor: "tok1" });
	});

	it("pages the pending invitations with --status Pending, --count and --limit", async () => {
		mockOrganizationsAPI.listUsers
			.mockResolvedValueOnce(page(["p1@example.com"], "tok1"))
			.mockResolvedValueOnce(page(["p2@example.com"]));
		const printed = await run("--status", "Pending", "--count", "5", "--limit", "1");
		expect(mockOrganizationsAPI.listUsers.mock.calls).toEqual([
			[ORG_ID, { limit: 1, status: "Pending" }],
			[ORG_ID, { cursor: "tok1", limit: 1, status: "Pending" }],
		]);
		expect(printed).toEqual({ Users: [{ Email: "p1@example.com" }, { Email: "p2@example.com" }], Count: 2 });
	});

	it("resumes from --cursor", async () => {
		mockOrganizationsAPI.listUsers.mockResolvedValueOnce(page(["b@example.com"]));
		await run("--cursor", "tok1");
		expect(mockOrganizationsAPI.listUsers).toHaveBeenCalledWith(ORG_ID, { cursor: "tok1", status: "Active" });
	});

	it("refuses a --status other than Active or Pending, and has no --start-key", async () => {
		await expect(run("--status", "Removed")).rejects.toThrow(/Allowed choices are Active, Pending/);
		await expect(run("--start-key", "usr_1")).rejects.toThrow(/unknown option/);
		expect(mockOrganizationsAPI.listUsers).not.toHaveBeenCalled();
	});
});
