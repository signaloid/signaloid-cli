import { Command, Help } from "commander";
import type { Option } from "commander";
import chalk from "chalk";

/**
 * Custom help formatter that mimics GitHub CLI (gh) style documentation.
 *
 * This provides clean, professional help output with:
 * - Clear section headers (USAGE, AVAILABLE COMMANDS, FLAGS, etc.)
 * - Aligned command/flag descriptions
 * - Proper formatting and spacing
 */
export class GhStyleHelp extends Help {
	optionDescription(option: Option): string {
		const desc = option.description || "";
		return desc.charAt(0).toUpperCase() + desc.slice(1);
	}

	/**
	 * Format the command and its subcommands in gh CLI style
	 */
	formatHelp(cmd: Command, helper: Help): string {
		const termWidth = helper.padWidth(cmd, helper);
		const helpWidth = helper.helpWidth || 80;

		const parts: string[] = [];

		// Description
		const desc = cmd.description();
		if (desc) {
			parts.push(desc);
			parts.push("");
		}

		// Usage
		const usage = helper.commandUsage(cmd);
		if (usage) {
			parts.push(chalk.bold("USAGE"));
			parts.push(`  ${usage}`);
			parts.push("");
		}

		// Subcommands (available commands)
		const subcommands = cmd.commands.filter((c) => !(c as any)._hidden);
		if (subcommands.length > 0) {
			parts.push(chalk.bold("AVAILABLE COMMANDS"));

			// Calculate max command name length for alignment
			const maxNameLength = Math.max(
				...subcommands.map((c) => c.name().length)
			);
			const padding = maxNameLength + 2;

			for (const subCmd of subcommands) {
				const name = subCmd.name().padEnd(padding);
				const desc = subCmd.description() || "";
				parts.push(`  ${chalk.cyan(name)} ${desc}`);
			}
			parts.push("");

			// Alias commands section
			const aliasEntries: { alias: string; primary: string }[] = [];
			for (const subCmd of subcommands) {
				for (const alias of subCmd.aliases()) {
					aliasEntries.push({ alias, primary: subCmd.name() });
				}
			}
			if (aliasEntries.length > 0) {
				parts.push(chalk.bold("ALIAS COMMANDS"));
				const maxAliasLength = Math.max(...aliasEntries.map((e) => e.alias.length + 1));
				for (const { alias, primary } of aliasEntries) {
					const paddedAlias = `${alias}:`.padEnd(maxAliasLength + 2);
					parts.push(`  ${chalk.cyan(paddedAlias)} Alias for "${primary}"`);
				}
				parts.push("");
			}
		}

		// Command-specific options (not inherited)
		const commandOptions = cmd.options.filter((opt) => {
			// Filter out inherited options
			return !(opt as any).inherited;
		});

		if (commandOptions.length > 0) {
			parts.push(chalk.bold("FLAGS"));
			for (const option of commandOptions) {
				const flags = helper.optionTerm(option);
				const desc = helper.optionDescription(option);
				parts.push(`  ${chalk.cyan(flags.padEnd(termWidth))} ${desc}`);
			}
			parts.push("");
		}

		// Inherited flags
		const inheritedOptions = cmd.options.filter((opt) => (opt as any).inherited);
		if (inheritedOptions.length > 0) {
			parts.push(chalk.bold("INHERITED FLAGS"));
			for (const option of inheritedOptions) {
				const flags = helper.optionTerm(option);
				const desc = helper.optionDescription(option);
				parts.push(`  ${chalk.cyan(flags.padEnd(termWidth))} ${desc}`);
			}
			parts.push("");
		}

		// Examples (if provided in _examples property)
		const examples = (cmd as any)._examples;
		if (examples && examples.length > 0) {
			parts.push(chalk.bold("EXAMPLES"));
			for (const example of examples) {
				if (typeof example === "string") {
					parts.push(`  $ ${chalk.dim(example)}`);
				} else if (example.description && example.command) {
					parts.push(`  ${chalk.dim(example.description)}`);
					parts.push(`  $ ${example.command}`);
					parts.push("");
				}
			}
		}

		// Learn more
		const learnMore = (cmd as any)._learnMore;
		if (learnMore) {
			parts.push(chalk.bold("LEARN MORE"));
			parts.push(`  ${learnMore}`);
			parts.push("");
		}

		return parts.join("\n");
	}
}

/**
 * Configure a command to use gh-style help
 */
export function useGhStyleHelp(cmd: Command) {
	cmd.configureHelp({
		formatHelp: (cmd, helper) => {
			const ghHelper = new GhStyleHelp();
			return ghHelper.formatHelp(cmd, helper);
		},
	});
	return cmd;
}

/**
 * Add examples to a command (for use in help output)
 */
export function addExamples(cmd: Command, examples: Array<string | { description: string; command: string }>) {
	(cmd as any)._examples = examples;
	return cmd;
}

/**
 * Add a "learn more" link to a command
 */
export function addLearnMore(cmd: Command, url: string) {
	(cmd as any)._learnMore = `Use ${chalk.cyan(cmd.name() + " <command> --help")} for more information about a command.\n  Read the manual at ${chalk.underline(url)}`;
	return cmd;
}
