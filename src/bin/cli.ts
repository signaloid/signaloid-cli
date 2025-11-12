#!/usr/bin/env node

import { Command } from "commander";

// Code generation
import createInit from "./commands/init";

// API calls
import auth from "./commands/api/auth";
import buckets from "./commands/api/buckets";
import builds from "./commands/api/builds";
import cores from "./commands/api/cores";
import drives from "./commands/api/drives";
import files from "./commands/api/files";
import github from "./commands/api/github";
import health from "./commands/api/health";
import keys from "./commands/api/keys";
import plot from "./commands/api/plot";
import repos from "./commands/api/repos";
import samples from "./commands/api/samples";
import tasks from "./commands/api/tasks";
import users from "./commands/api/users";
import webhooks from "./commands/api/webhooks";

const program = new Command();

program
	.name("signaloid-cli")
	.description("Signaloid CLI — generators + API actions")
	.version("1.0.0")
	.option("-d, --debug", "Output extra debugging")
	.option("--json", "Machine-readable JSON output")
	.option("--quiet", "Suppress spinners and nonessential output")
	.helpCommand("help [command]", "Display help for command");

program.configureHelp({
	optionDescription: (option) => {
		const desc = option.description || "";
		return desc.charAt(0).toUpperCase() + desc.slice(1);
	},
});

createInit(program);

// API commands
auth(program);
buckets(program);
builds(program);
cores(program);
drives(program);
files(program);
github(program);
health(program);
keys(program);
plot(program);
repos(program);
samples(program);
tasks(program);
users(program);
webhooks(program);

program.parse(process.argv);
