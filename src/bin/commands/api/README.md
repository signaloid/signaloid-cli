# API Commands

This directory contains the command implementations for the Signaloid CLI. Each file exports a function that registers commands and subcommands with the Commander.js program.

## Overview

The Signaloid CLI provides a comprehensive command-line interface for interacting with the Signaloid API. All commands in this directory follow a consistent pattern:

1. Import the Commander `Command` type and utility functions
2. Export a default function that takes a `Command` (the Commander program)
3. Register one or more commands/subcommands with options and actions
4. Use the Signaloid SDK client to interact with the API

## Command Files

### Authentication & Environment

- **auth.ts** - Authentication management (login via API key or email/password, whoami, logout)
- **keys.ts** - API key management (list, create, revoke)

### User & Account Management

- **users.ts** - User account management (profile info, updates, activity logs, session management)

### Code & Repository Management

- **repos.ts** - Repository management (list, create, update, delete code repositories)
- **github.ts** - GitHub integration (connect/disconnect GitHub accounts, view status)

### Build & Execution

- **builds.ts** - Build management (create from source or repo, list, status, outputs, watch, cancel, delete)
- **cores.ts** - Computation core management (list, create, update, delete core configurations)
- **tasks.ts** - Task execution management (create from builds, list, status, outputs, watch, cancel, delete)

### Data & Storage

- **files.ts** - File management in cloud storage (list, upload, download, stat, delete)
- **buckets.ts** - S3-compatible bucket management (list, create, update, delete)
- **drives.ts** - Virtual drive management (connect data sources like buckets and gateways)

### IoT & Integration

- **webhooks.ts** - Webhook integration (list, create, update, delete webhook endpoints for event notifications)

### Analysis & Visualization

- **samples.ts** - Statistical sample retrieval (get Monte Carlo samples from task outputs)
- **plotting.ts** - Plot generation (create visualizations and kernel density estimates)

### Utilities

- **health.ts** - API health check (ping the Signaloid API to verify connectivity)

## Common Patterns

### Command Structure

Each command file follows this general structure:

```typescript
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "../../utils/config";
import { makeClient } from "../../utils/sdk";

/**
 * JSDoc documentation describing the command
 */
export default function commandName(program: Command) {
	const cmd = program.command("command-name").description("Description");

	cmd.command("subcommand")
		.description("Subcommand description")
		.option("--flag <value>", "Option description")
		.action(async (opts) => {
			const spinner = ora("Loading...").start();
			try {
				const client = makeClient(await loadConfig());
				const result = await client.resource.method(opts);
				spinner.succeed();
				console.log(JSON.stringify(result, null, 2));
			} catch (e: any) {
				spinner.fail("Failed");
				console.error(e?.message || String(e));
				process.exit(1);
			}
		});
}
```

### Consistent Features

All commands implement:

- **Spinner feedback** - Visual feedback using `ora` for long-running operations
- **Error handling** - Try-catch blocks with user-friendly error messages
- **JSON output** - Results formatted as pretty-printed JSON
- **Configuration loading** - Automatic loading of user configuration via `loadConfig()`
- **SDK client** - Use of the typed Signaloid SDK client for API interactions

### Option Naming Conventions

Commands follow these conventions for options:

- Use kebab-case for multi-word options (e.g., `--build-id`, `--start-key`)
- Use descriptive names that match the API resource properties
- Include type coercion for numeric values using `parseInt(v, 10)`
- Use boolean flags without values for true/false options

### Data Handling

- **Input**: Commands accept data via:
    - Command-line options (`--flag value`)
    - JSON payload files (`--file payload.json`, `--params-file config.json`)
    - Inline JSON strings for complex data structures

- **Output**: Commands output data as:
    - Pretty-printed JSON to stdout (for structured data)
    - Success/failure messages via spinner (for user feedback)
    - Downloaded files to specified paths (for binary/text outputs)

## Adding New Commands

To add a new command:

1. Create a new `.ts` file in this directory
2. Follow the common pattern structure shown above
3. Add comprehensive JSDoc documentation
4. Export a default function that registers the command
5. Import and register the command in `src/bin/index.ts`
6. Add tests in a corresponding `.test.ts` file

## Testing

Each command has a corresponding `.test.ts` file in this directory that contains unit tests. Tests use mocking to avoid making actual API calls during test execution.

## Related Documentation

- [Signaloid API Documentation](https://docs.signaloid.io/)
- [Commander.js Documentation](https://github.com/tj/commander.js)
- [SDK Client Documentation](../../utils/sdk.ts)
