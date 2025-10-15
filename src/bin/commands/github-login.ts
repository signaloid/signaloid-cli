import { Command } from "commander";
import { loginAndGetToken } from "../utils/github-auth";

export default function (program: Command) {
	const create = program
		.command("login")
		.description("Login to Github npm registry in order to clone application dependencies.")
		.arguments("<projectDir>")
		.action(async (directory: string) => {
			await loginAndGetToken(directory);
		});
}
