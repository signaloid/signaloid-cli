#!/usr/bin/env node

import { Command } from "commander";
import createCommand from "./commands/init";
import createValidateApiKeyCommand from "./commands/validate-api-key";
const program = new Command();
program.name("signaloid-cli");
// INIT command
createCommand(program);

// Validate API key command
createValidateApiKeyCommand(program);

program.option("-d, --debug", "output extra debugging");

program.name("signaloid-cli").description("A code generator CLI tool").version("0.0.1");

program.parse(process.argv);
