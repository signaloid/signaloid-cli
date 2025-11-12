import inquirer from "inquirer";
import { DemoApplicationDetails } from "../file-generators/applications";

export async function promptForApplicationDetails(): Promise<DemoApplicationDetails> {
	console.log("⚙️ Configuring application details...");
	return inquirer.prompt<DemoApplicationDetails>([
		{ type: "input", name: "title", message: "Enter application title:", default: "Signaloid application" },
		{
			type: "input",
			name: "description",
			message: "Enter a short description for your application:",
			default: "A new application created with Signaloid CLI.",
		},
		{
			type: "input",
			name: "repoUrl",
			message: "Enter GitHub repository HTTPS URL of your C code application:",
			default: "https://github.com/signaloid/Signaloid-CLI-Demo-C-Template.git",
			validate: (input) => {
				const githubHttpsRegex = /^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+(\.git)?$/;
				if (githubHttpsRegex.test(input)) {
					return true;
				}
				return "Please enter a valid GitHub repository URL using HTTPS (e.g., https://github.com/user/repo.git). SSH URLs are not supported.";
			},
		},
		{
			type: "input",
			name: "coreId",
			message: "Enter Signaloid Core ID:",
			default: "cor_b852539c8ffd5a40a2688a0b29e344b5",
		},
		{ type: "input", name: "commit", message: "Enter the commit hash or branch to build:", default: "HEAD" },
		{ type: "input", name: "branch", message: "Enter the branch name:", default: "main" },
		{ type: "input", name: "buildDirectory", message: "Enter the build directory:", default: "src" },
		{
			type: "input",
			name: "defaultArguments",
			message: 'Enter application general arguments [Optional] (e.g., "-j"):',
			default: "",
		},
	]);
}
