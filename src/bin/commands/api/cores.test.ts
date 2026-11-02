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
	const cores = {
		list: jest.fn().mockResolvedValue({ Cores: [{ CoreID: "c1" }] }),
		getOne: jest.fn().mockResolvedValue({ CoreID: "c1" }),
		create: jest.fn().mockResolvedValue({ CoreID: "c2" }),
		update: jest.fn().mockResolvedValue({ CoreID: "c3" }),
		delete: jest.fn().mockResolvedValue({ ok: true }),
	};
	return {
		__esModule: true,
		makeClient: jest.fn().mockReturnValue({ cores }),
		mockCoresAPI: cores,
	};
});

import coresCmd from "./cores";
const { mockCoresAPI } = jest.requireMock("../../utils/sdk");

const logs: string[] = [];
jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
	logs.push(args[0] != null ? String(args[0]) : "");
});
const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
let exitCode: number | undefined;
jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
	exitCode = code as number;
	throw new Error("EXIT");
}) as any);

const makeProgram = () => {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({ writeOut() {}, writeErr() {} });
	coresCmd(program);
	return program;
};

describe("cores CLI", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logs.length = 0;
		exitCode = undefined;
		process.exitCode = undefined;
		mockCoresAPI.list.mockResolvedValue({ Cores: [{ CoreID: "c1" }] });
	});

	it("list without --default", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "list"]);
		// With no flag, cores list fetches default and custom separately, so two calls.
		expect(mockCoresAPI.list).toHaveBeenCalledWith({ default: true });
		expect(mockCoresAPI.list).toHaveBeenCalledWith({});
		expect(mockCoresAPI.list).toHaveBeenCalledTimes(2);
	});

	it("list with --default", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "list", "--default"]);
		expect(mockCoresAPI.list).toHaveBeenCalledWith({ default: true });
	});

	it("list with empty result exits 0 and prints the empty structure", async () => {
		// An empty list is a success, so it prints the empty structure and does not exit.
		mockCoresAPI.list.mockResolvedValue({ Cores: [] });
		const program = makeProgram();
		await expect(program.parseAsync(["node", "x", "cores", "list"])).resolves.toBeDefined();
		expect(mockCoresAPI.list).toHaveBeenCalled();
		expect(exitCode).toBeUndefined();
		const printed = logs.join("\n");
		expect(printed).toContain('"Cores": []');
		expect(printed).toContain('"Count": 0');
	});

	it("get", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "get", "--core-id", "core-1"]);
		expect(mockCoresAPI.getOne).toHaveBeenCalledWith("core-1");
	});

	it("create", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"MyCore",
			"--class",
			"C0Pro",
			"--precision",
			"32",
			"--microarchitecture",
			"Athens",
			"--dependency-tracking",
			"Basic",
		]);
		expect(mockCoresAPI.create).toHaveBeenCalledWith({
			Name: "MyCore",
			Class: "C0Pro",
			Precision: 32,
			Microarchitecture: "Athens",
			DependencyTracking: "Basic",
		});
	});

	it("list table shows the legacy CorrelationTracking of older cores", async () => {
		mockCoresAPI.list.mockResolvedValue({ Cores: [{ CoreID: "c1", CorrelationTracking: "Autocorrelation" }] });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "list", "--format", "table", "--columns", "id,dependency"]);
		expect(logs.join("\n")).toContain("Autocorrelation");
	});

	it.each([
		["--class", "C0"],
		["--microarchitecture", "Athen"],
		["--microarchitecture", "Atlas"],
		["--dependency-tracking", "Autocorrelation"],
	])("create rejects %s %s before calling the API", async (flag, value) => {
		const args = ["--class", "C0Pro", "--microarchitecture", "Athens", "--dependency-tracking", "Basic"];
		args[args.indexOf(flag) + 1] = value;
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "cores", "create", "--name", "MyCore", "--precision", "32", ...args]),
		).rejects.toThrow(/Allowed choices/);
		expect(mockCoresAPI.create).not.toHaveBeenCalled();
	});

	it("update rejects --class C0 before fetching the core", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-6", "--class", "C0"]),
		).rejects.toThrow(/Allowed choices/);
		expect(mockCoresAPI.getOne).not.toHaveBeenCalled();
	});

	it("create still forwards a deprecated --memory", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"MyCore",
			"--class",
			"C0Pro",
			"--precision",
			"32",
			"--memory",
			"2048",
			"--microarchitecture",
			"Athens",
			"--dependency-tracking",
			"Basic",
		]);
		expect(mockCoresAPI.create).toHaveBeenCalledWith(expect.objectContaining({ MemorySize: 2048 }));
	});

	it("update with partial fields", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({
			CoreID: "core-2",
			Name: "Old",
			Class: "C0Pro",
			Precision: 32,
			MemorySize: 1024,
			Microarchitecture: "Athens",
			DependencyTracking: "Basic",
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-2",
			"--name",
			"Renamed",
			"--precision",
			"64",
			"--dependency-tracking",
			"None",
		]);
		expect(mockCoresAPI.update).toHaveBeenCalledWith("core-2", {
			Name: "Renamed",
			Class: "C0Pro",
			Precision: 64,
			Microarchitecture: "Athens",
			DependencyTracking: "None",
		});
	});

	it("update refuses a stored C0 core unless --class moves it off C0", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({
			CoreID: "core-4",
			Name: "Legacy",
			Class: "C0",
			Precision: 32,
			MemorySize: 1024,
			Microarchitecture: "Athens",
			DependencyTracking: "Basic",
		});
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-4", "--name", "Renamed"]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain("C0 is retired");
		expect(mockCoresAPI.update).not.toHaveBeenCalled();
	});

	it("update migrates a stored C0 core with --class C0Pro", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({
			CoreID: "core-5",
			Name: "Legacy",
			Class: "C0",
			Precision: 32,
			MemorySize: 1024,
			Microarchitecture: "Athens",
			DependencyTracking: "Basic",
		});
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-5", "--class", "C0Pro"]);
		expect(mockCoresAPI.update).toHaveBeenCalledWith("core-5", expect.objectContaining({ Class: "C0Pro" }));
	});

	it("create an r7i core without --precision or --dependency-tracking", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"Native",
			"--class",
			"r7i",
			"--microarchitecture",
			"Native",
		]);
		expect(mockCoresAPI.create).toHaveBeenCalledWith({ Name: "Native", Class: "r7i", Microarchitecture: "Native" });
	});

	it.each([
		[["--dependency-tracking", "Basic"], "--precision is required"],
		[["--precision", "32"], "--dependency-tracking is required"],
		[[], "--precision and --dependency-tracking are required"],
	])("create without %j for a class other than r7i is a usage error", async (args, message) => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"MyCore",
			"--class",
			"C0Pro",
			"--microarchitecture",
			"Athens",
			...args,
		]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain(message);
		expect(mockCoresAPI.create).not.toHaveBeenCalled();
	});

	it("create requires --microarchitecture", async () => {
		const program = makeProgram();
		await expect(
			program.parseAsync(["node", "x", "cores", "create", "--name", "MyCore", "--class", "r7i"]),
		).rejects.toThrow(/--microarchitecture/);
		expect(mockCoresAPI.create).not.toHaveBeenCalled();
	});

	it.each([
		[["--precision", "32"], "--precision"],
		[["--dependency-tracking", "Basic"], "--dependency-tracking"],
	])("create of an r7i core with %j is a usage error", async (args, flag) => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"Native",
			"--class",
			"r7i",
			"--microarchitecture",
			"Native",
			...args,
		]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain(`takes no ${flag}`);
		expect(mockCoresAPI.create).not.toHaveBeenCalled();
	});

	it.each([
		["r7i", "Bypass", "The r7i class takes only the Native microarchitecture"],
		["C0Pro", "Native", "The Native microarchitecture works only with the r7i class"],
	])("create of a %s core with --microarchitecture %s is a usage error", async (coreClass, arch, message) => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"create",
			"--name",
			"MyCore",
			"--class",
			coreClass,
			"--microarchitecture",
			arch,
			"--precision",
			"32",
			"--dependency-tracking",
			"None",
		]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain(message);
		expect(mockCoresAPI.create).not.toHaveBeenCalled();
	});

	it("update to the r7i class leaves out the stored Precision and DependencyTracking", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({
			CoreID: "core-7",
			Name: "Pro",
			Class: "C0Pro",
			Precision: 32,
			MemorySize: 8192000000,
			Microarchitecture: "Athens",
			DependencyTracking: "Basic",
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-7",
			"--class",
			"r7i",
			"--microarchitecture",
			"Native",
		]);
		expect(mockCoresAPI.update).toHaveBeenCalledWith("core-7", {
			Name: "Pro",
			Class: "r7i",
			Microarchitecture: "Native",
		});
	});

	const storedNative = {
		CoreID: "core-8",
		Name: "Native",
		Class: "r7i",
		Precision: 0,
		MemorySize: 8192000000,
		Microarchitecture: "Native",
		DependencyTracking: "None",
	};
	const storedPro = { ...storedNative, Class: "C0Pro", Precision: 32, Microarchitecture: "Athens" };

	it.each([
		[
			"an r7i core to C0Pro without --precision",
			storedNative,
			["--class", "C0Pro", "--microarchitecture", "Athens"],
			"Pass --precision to",
		],
		[
			"an r7i core to C0Pro without --microarchitecture",
			storedNative,
			["--class", "C0Pro", "--precision", "32"],
			"Pass --microarchitecture to",
		],
		[
			"an r7i core to C0Pro without either",
			storedNative,
			["--class", "C0Pro"],
			"Pass --microarchitecture and --precision to",
		],
		[
			"a stored r7i core to Bypass without --class",
			storedNative,
			["--microarchitecture", "Bypass"],
			"The r7i class takes only the Native microarchitecture",
		],
		[
			"a stored C0Pro core to Native without --class",
			storedPro,
			["--microarchitecture", "Native"],
			"The Native microarchitecture works only with the r7i class",
		],
	])("update of %s is a usage error", async (_label, stored, args, message) => {
		mockCoresAPI.getOne.mockResolvedValueOnce(stored);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", ...args]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain(message);
		expect(mockCoresAPI.update).not.toHaveBeenCalled();
	});

	it("update to r7i with a non-zero --precision is a usage error before fetching the core", async () => {
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-8",
			"--class",
			"r7i",
			"--microarchitecture",
			"Native",
			"--precision",
			"32",
			"--dependency-tracking",
			"Basic",
		]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain("takes no --precision or --dependency-tracking");
		expect(mockCoresAPI.getOne).not.toHaveBeenCalled();
	});

	it.each([
		["Autocorrelation", "Basic"],
		["Disable", "None"],
	])("update of an older core migrates CorrelationTracking %s to %s", async (legacy, mode) => {
		const { DependencyTracking, ...stored } = storedPro;
		mockCoresAPI.getOne.mockResolvedValueOnce({ ...stored, CorrelationTracking: legacy });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--name", "Renamed"]);
		expect(mockCoresAPI.update).toHaveBeenCalledWith("core-8", {
			Name: "Renamed",
			Class: "C0Pro",
			Precision: 32,
			Microarchitecture: "Athens",
			DependencyTracking: mode,
		});
	});

	it.each([["Autocorrelation"], ["Disable"]])(
		"update of an older Jupiter core with CorrelationTracking %s sends Advanced",
		async (legacy) => {
			const { DependencyTracking, ...stored } = storedPro;
			mockCoresAPI.getOne.mockResolvedValueOnce({
				...stored,
				Microarchitecture: "Jupiter",
				CorrelationTracking: legacy,
			});
			const program = makeProgram();
			await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--name", "Renamed"]);
			expect(mockCoresAPI.update).toHaveBeenCalledWith(
				"core-8",
				expect.objectContaining({ Microarchitecture: "Jupiter", DependencyTracking: "Advanced" }),
			);
		},
	);

	it("update of an r7i core to C0Pro Jupiter sends the only mode Jupiter accepts", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce(storedNative);
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-8",
			"--class",
			"C0Pro",
			"--microarchitecture",
			"Jupiter",
			"--precision",
			"32",
		]);
		expect(process.exitCode).toBeUndefined();
		expect(mockCoresAPI.update).toHaveBeenCalledWith(
			"core-8",
			expect.objectContaining({ Microarchitecture: "Jupiter", DependencyTracking: "Advanced" }),
		);
	});

	it("update of a Jupiter core to Athens without --dependency-tracking is a usage error", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({
			...storedPro,
			Microarchitecture: "Jupiter",
			DependencyTracking: "Advanced",
		});
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-8",
			"--microarchitecture",
			"Athens",
		]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain("Pass --dependency-tracking (None or Basic)");
		expect(mockCoresAPI.update).not.toHaveBeenCalled();
	});

	it("update keeps an explicit --dependency-tracking even if the API will refuse it", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce(storedPro);
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-8",
			"--microarchitecture",
			"Jupiter",
			"--dependency-tracking",
			"Basic",
		]);
		expect(mockCoresAPI.update).toHaveBeenCalledWith(
			"core-8",
			expect.objectContaining({ Microarchitecture: "Jupiter", DependencyTracking: "Basic" }),
		);
	});

	it("update of an Atlas core without --microarchitecture is a usage error", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedPro, Microarchitecture: "Atlas" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--name", "Renamed"]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain("Atlas is retired");
		expect(mockCoresAPI.update).not.toHaveBeenCalled();
	});

	it("update migrates an Atlas core with --microarchitecture Rome", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedPro, Microarchitecture: "Atlas" });
		const program = makeProgram();
		await program.parseAsync([
			"node",
			"x",
			"cores",
			"update",
			"--core-id",
			"core-8",
			"--microarchitecture",
			"Rome",
		]);
		expect(process.exitCode).toBeUndefined();
		expect(mockCoresAPI.update).toHaveBeenCalledWith(
			"core-8",
			expect.objectContaining({ Microarchitecture: "Rome" }),
		);
	});

	it("update of a stored r7i core without --class still refuses a non-zero --precision", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce(storedNative);
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--precision", "32"]);
		expect(process.exitCode).toBe(2);
		expect(errorSpy.mock.calls.flat().join(" ")).toContain("takes no --precision");
		expect(mockCoresAPI.update).not.toHaveBeenCalled();
	});

	it.each([["Athens"], ["Bypass"], ["Atlas"]])(
		"update of a %s core to r7i without --microarchitecture sends Native",
		async (arch) => {
			mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedPro, Microarchitecture: arch });
			const program = makeProgram();
			await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--class", "r7i"]);
			expect(process.exitCode).toBeUndefined();
			expect(mockCoresAPI.update).toHaveBeenCalledWith("core-8", {
				Name: "Native",
				Class: "r7i",
				Microarchitecture: "Native",
			});
		},
	);

	it.each([
		["r7i", "Bypass", "The r7i class takes only the Native microarchitecture"],
		["C0Pro", "Native", "The Native microarchitecture works only with the r7i class"],
	])(
		"update with --class %s and --microarchitecture %s is a usage error before fetching the core",
		async (coreClass, arch, message) => {
			const program = makeProgram();
			await program.parseAsync([
				"node",
				"x",
				"cores",
				"update",
				"--core-id",
				"core-8",
				"--class",
				coreClass,
				"--microarchitecture",
				arch,
			]);
			expect(process.exitCode).toBe(2);
			expect(errorSpy.mock.calls.flat().join(" ")).toContain(message);
			expect(mockCoresAPI.getOne).not.toHaveBeenCalled();
		},
	);

	it("update of a stored r7i Bypass core sends Native", async () => {
		mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedNative, Microarchitecture: "Bypass" });
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "update", "--core-id", "core-8", "--name", "Renamed"]);
		expect(process.exitCode).toBeUndefined();
		expect(mockCoresAPI.update).toHaveBeenCalledWith("core-8", {
			Name: "Renamed",
			Class: "r7i",
			Microarchitecture: "Native",
		});
	});

	describe("Bypass", () => {
		const storedBypass = { ...storedPro, Microarchitecture: "Bypass", DependencyTracking: "None", Precision: 0 };
		const run = (...args: string[]) => makeProgram().parseAsync(["node", "x", "cores", ...args]);
		const createArgs = ["create", "--name", "B", "--class", "C0Pro", "--microarchitecture", "Bypass"];

		it("create leaves --precision out and does not send it", async () => {
			await run(...createArgs, "--dependency-tracking", "None");
			expect(process.exitCode).toBeUndefined();
			expect(mockCoresAPI.create).toHaveBeenCalledWith({
				Name: "B",
				Class: "C0Pro",
				Microarchitecture: "Bypass",
				DependencyTracking: "None",
			});
		});

		it("create accepts --precision 0", async () => {
			await run(...createArgs, "--precision", "0", "--dependency-tracking", "None");
			expect(mockCoresAPI.create).toHaveBeenCalledWith(expect.objectContaining({ Precision: 0 }));
		});

		it("create refuses any other --precision", async () => {
			await run(...createArgs, "--precision", "32", "--dependency-tracking", "None");
			expect(process.exitCode).toBe(2);
			expect(errorSpy.mock.calls.flat().join(" ")).toContain("Bypass microarchitecture takes no --precision");
			expect(mockCoresAPI.create).not.toHaveBeenCalled();
		});

		it("create leaves --dependency-tracking out too and sends neither", async () => {
			await run(...createArgs);
			expect(process.exitCode).toBeUndefined();
			expect(mockCoresAPI.create).toHaveBeenCalledWith({
				Name: "B",
				Class: "C0Pro",
				Microarchitecture: "Bypass",
			});
		});

		it("create refuses a --dependency-tracking other than None", async () => {
			await run(...createArgs, "--dependency-tracking", "Basic");
			expect(process.exitCode).toBe(2);
			expect(errorSpy.mock.calls.flat().join(" ")).toContain(
				"Bypass microarchitecture takes no --dependency-tracking",
			);
			expect(mockCoresAPI.create).not.toHaveBeenCalled();
		});

		it("update of a stored Bypass core refuses --dependency-tracking Basic", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce(storedBypass);
			await run("update", "--core-id", "core-8", "--dependency-tracking", "Basic");
			expect(process.exitCode).toBe(2);
			expect(mockCoresAPI.update).not.toHaveBeenCalled();
		});

		it("update sends Precision 0 for a core stored with another value", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedBypass, Precision: 32 });
			await run("update", "--core-id", "core-8", "--name", "Renamed");
			expect(mockCoresAPI.update).toHaveBeenCalledWith("core-8", {
				Name: "Renamed",
				Class: "C0Pro",
				Microarchitecture: "Bypass",
				Precision: 0,
				DependencyTracking: "None",
			});
		});

		it("update with --microarchitecture Bypass refuses --precision 32 before fetching the core", async () => {
			await run("update", "--core-id", "core-8", "--microarchitecture", "Bypass", "--precision", "32");
			expect(process.exitCode).toBe(2);
			expect(mockCoresAPI.getOne).not.toHaveBeenCalled();
		});

		it("update of a stored Bypass core refuses --precision 32", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce(storedBypass);
			await run("update", "--core-id", "core-8", "--precision", "32");
			expect(process.exitCode).toBe(2);
			expect(errorSpy.mock.calls.flat().join(" ")).toContain("Bypass microarchitecture takes no --precision");
			expect(mockCoresAPI.update).not.toHaveBeenCalled();
		});

		it("update to Bypass sends Precision 0 and the only tracking mode Bypass takes", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce({ ...storedPro, DependencyTracking: "Basic" });
			await run("update", "--core-id", "core-8", "--microarchitecture", "Bypass");
			expect(mockCoresAPI.update).toHaveBeenCalledWith(
				"core-8",
				expect.objectContaining({ Microarchitecture: "Bypass", Precision: 0, DependencyTracking: "None" }),
			);
		});

		it("update from Bypass to Athens without --precision is a usage error", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce(storedBypass);
			await run("update", "--core-id", "core-8", "--microarchitecture", "Athens");
			expect(process.exitCode).toBe(2);
			expect(errorSpy.mock.calls.flat().join(" ")).toContain(
				"Pass --precision to change this C0Pro Bypass core to Athens",
			);
			expect(mockCoresAPI.update).not.toHaveBeenCalled();
		});

		it("update from Bypass to Athens with --precision sends it", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce(storedBypass);
			await run("update", "--core-id", "core-8", "--microarchitecture", "Athens", "--precision", "64");
			expect(mockCoresAPI.update).toHaveBeenCalledWith(
				"core-8",
				expect.objectContaining({ Microarchitecture: "Athens", Precision: 64 }),
			);
		});

		it("update of an r7i core to C0Pro Bypass needs no --precision", async () => {
			mockCoresAPI.getOne.mockResolvedValueOnce(storedNative);
			await run("update", "--core-id", "core-8", "--class", "C0Pro", "--microarchitecture", "Bypass");
			expect(process.exitCode).toBeUndefined();
			expect(mockCoresAPI.update).toHaveBeenCalledWith(
				"core-8",
				expect.objectContaining({
					Class: "C0Pro",
					Microarchitecture: "Bypass",
					Precision: 0,
					DependencyTracking: "None",
				}),
			);
		});
	});

	it("delete", async () => {
		const program = makeProgram();
		await program.parseAsync(["node", "x", "cores", "delete", "--core-id", "core-3"]);
		expect(mockCoresAPI.delete).toHaveBeenCalledWith("core-3");
	});
});

afterAll(() => {
	process.exitCode = undefined;
});
