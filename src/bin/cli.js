"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// bin/cli.ts
var commander_1 = require("commander");
var launchUI = require("../server/launch").launchUI;
var program = new commander_1.Command();
program
	.command("generate")
	.description("Launch UI to generate code")
	.action(function () {
		launchUI();
	});
program.parse(process.argv);
