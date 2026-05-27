#!/usr/bin/env node
import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 20;

import { Command } from "commander";
import chalk from "chalk";

// Code generation
import createInit from "./commands/init";
import completion from "./commands/completion";

// API calls
import auth from "./commands/api/auth";
import health from "./commands/api/health";
import builds from "./commands/api/builds";
import tasks from "./commands/api/tasks";
import buckets from "./commands/api/buckets";
import files from "./commands/api/files";
import repos from "./commands/api/repos";
import keys from "./commands/api/keys";
import organizations from "./commands/api/organizations";
import cores from "./commands/api/cores";
import drives from "./commands/api/drives";
import plot from "./commands/api/plot";
import samples from "./commands/api/samples";
import users from "./commands/api/users";
import webhooks from "./commands/api/webhooks";
import github from "./commands/api/github";
import { useGhStyleHelp } from "./utils/help-formatter";
import { setVerbosity } from "./utils/verbosity";

const program = new Command();

program
	.name("signaloid-cli")
	.description("Signaloid CLI — Command-line interface for the Signaloid Cloud Compute Engine")
	.version("2.0.0")
	.option("-d, --debug", "Output extra debugging")
	.option("--json", "Machine-readable JSON output")
	.option("--verbosity <n>", "Output verbosity level: 0=silent, 1=errors only, 2=full", "2")
	.helpCommand("help [command]", "Display help for command");

// Use gh-style help for the main program
useGhStyleHelp(program);

// Add a custom footer to the main help
(program as any)._learnMore = `
Use ${chalk.cyan("signaloid-cli <command> --help")} for more information about a command.

Read the manual at ${chalk.underline("https://docs.signaloid.io/docs/api/signaloid-cli/intro")}
`;


program.hook("preAction", (_thisCommand, actionCommand) => {
	setVerbosity(parseInt(program.opts().verbosity ?? "2", 10));
	if (program.opts().json) {
		actionCommand.setOptionValue("format", "json");
	}
});

auth(program);
buckets(program);
builds(program);
completion(program);
cores(program);
drives(program);
files(program);
github(program);
health(program);
createInit(program);
keys(program);
organizations(program);
plot(program);
repos(program);
samples(program);
tasks(program);
users(program);
webhooks(program);

// Add command aliases for faster workflow
program.commands.forEach((cmd) => {
	switch (cmd.name()) {
		case "auth":
			cmd.alias("a");
			break;
		case "builds":
			cmd.aliases(["b", "build"]);
			break;
		case "tasks":
			cmd.aliases(["t", "task"]);
			break;
		case "repos":
			cmd.aliases(["r", "repo"]);
			break;
		case "cores":
			cmd.alias("c");
			break;
		case "keys":
			cmd.alias("k");
			break;
		case "files":
			cmd.alias("f");
			break;
		case "buckets":
			cmd.alias("bkt");
			break;
	}
});

program.parse(process.argv);
