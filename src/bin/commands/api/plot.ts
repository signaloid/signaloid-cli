import { Command } from "commander";
import ora from "ora";
import path from "path";
import { loadConfig } from "../../utils/config";
import { webReadableToBuffer, writeBinary } from "../../utils/fsx";
import { loadJsonIfPath } from "../../utils/params";
import { makeClient } from "../../utils/sdk";
import { PlotResponse } from "@signaloid/scce-sdk";

/**
 * Registers the 'plot' command and subcommands for generating plots and visualizations.
 *
 * This command provides functionality for creating various types of plots and visualizations
 * from Signaloid data, including general plots and kernel density estimates (KDE).
 *
 * Available subcommands:
 * - plot: Generate a general plot from JSON payload specification
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * signaloid-cli plotting plot --file payload.json --out ./plots
 * ```
 */
export default function plot(program: Command) {
	const cmd = program.command("plot").description("Plotting API");

	// signaloid-cli plot ux-string --file payload.json
	// signaloid-cli plot ux-string --ux-string <ux string>
	cmd.command("ux-string")
		.description("Plot distributions from Ux strings")
		.option("--ux-string <ux-string>", "Ux string")
		.option("--file <json>", "Payload JSON file with Ux strings")
		.option(
			"--out-file <path/filename>",
			"Path and filename for the output file (only valid when using --ux-string)",
		)
		.option("--out <dir>", "Directory to save file")
		.action(async (opts) => {
			const spinner = ora("Plotting...").start();
			if (!opts.uxString && !opts.file) {
				spinner.fail("Either --ux-string or --file is required");
				process.exit(1);
			}
			try {
				const client = makeClient(await loadConfig());
				let res: PlotResponse;
				if (opts.file) {
					const payload = await loadJsonIfPath(opts.file);
					res = await client.plotting.plot(payload as any);
				} else {
					const raw = opts.uxString;
					res = await client.plotting.plot(raw);
				}

				if (opts.outFile && !opts.uxString) {
					spinner.fail("--out-file can only be used together with --ux-string");
					process.exit(1);
				}

				const plotId = res.plotID;
				const plotImage = await fetch(res.presignedURL, { method: "GET" });

				let outDir = path.resolve(opts.out || `.${path.sep}`);
				let fileName = `${plotId}.png`;
				let fullPath = path.join(outDir, fileName);

				if (opts.outFile) {
					fullPath = path.resolve(opts.outFile);
					outDir = path.dirname(fullPath);
					fileName = path.basename(fullPath);
				}
				writeBinary(outDir, fileName, await webReadableToBuffer(plotImage.body!));
				spinner.succeed(`Saved: ${fullPath}`);
			} catch (e: any) {
				spinner.fail("Plot failed");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});

	// signaloid-cli plot valueID --task-id <id> --value-id <id>
	// or: --file payload.json  (expects { "taskID": "...", "valueID": "..." })
	cmd.command("value-id")
		.description("Plot distributions from a Reference Core task using output Value IDs")
		.option("--task-id <id>", "Task ID")
		.option("--value-id <id>", "Value ID")
		.option("--file <json>", "Optional JSON file with { taskID, valueID }")
		.option(
			"--out-file <path/filename>",
			"Path and filename for the output file (only valid when using --ux-string)",
		)
		.option("--out <dir>", "Directory to save file")
		.action(async (opts) => {
			const spinner = ora("Plotting value...").start();
			try {
				const client = makeClient(await loadConfig());
				let taskID: string | undefined = opts.taskId;
				let valueID: string | undefined = opts.valueId;

				if (opts.file) {
					const fromFile = (await loadJsonIfPath(opts.file)) as any;
					if (fromFile) {
						taskID = taskID ?? fromFile.taskID ?? fromFile.TaskID;
						valueID = valueID ?? fromFile.valueID ?? fromFile.ValueID;
					}
				}

				if (!taskID || !valueID) {
					throw new Error("Both taskID and valueID are required (via flags or JSON file).");
				}

				// SDK signature: plotValue(taskID, valueID)
				const res = await client.plotting.plotValue(String(taskID), String(valueID));

				spinner.succeed();
				const plotId = res.plotID;
				const plotImage = await fetch(res.presignedURL, { method: "GET" });

				let outDir = path.resolve(opts.out || `.${path.sep}`);
				let fileName = `${plotId}.png`;
				let fullPath = path.join(outDir, fileName);

				if (opts.outFile) {
					fullPath = path.resolve(opts.outFile);
					outDir = path.dirname(fullPath);
					fileName = path.basename(fullPath);
				}
				writeBinary(outDir, fileName, await webReadableToBuffer(plotImage.body!));
				spinner.succeed(`Saved: ${fullPath}`);
			} catch (e: any) {
				spinner.fail("Plot value failed");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
