# Signaloid CLI

The Signaloid CLI is a comprehensive command-line tool for the [Signaloid Cloud Compute Engine (SCCE)](https://signaloid.io). It has two distinct capabilities:

1. **SCCE API access** — full command-line management of builds, tasks, repositories, cores, files, drives, keys, webhooks, and more. Use it to integrate SCCE into custom scripts, batch processing, or automated pipelines.
2. **Web app generation** — generate a graphical web front end for an existing C/C++ application that uses Signaloid's UxHw API, to visualize how input parameter distributions affect the distribution of application outputs.

![Diagram showing how Signaloid CLI generates web applications and interacts with Signaloid Cloud Compute Engine](assets/cli-tool-diagram.png)

For information on these features, see the [Signaloid CLI developer documentation](https://docs.signaloid.io/docs/api/signaloid-cli/intro).

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
  - [auth](#auth)
  - [builds](#builds)
  - [buckets](#buckets)
  - [completion](#completion)
  - [cores](#cores)
  - [drives](#drives)
  - [files](#files)
  - [github](#github)
  - [health](#health)
  - [init](#init)
  - [keys](#keys)
  - [organizations](#organizations)
  - [plot](#plot)
  - [repos](#repos)
  - [samples](#samples)
  - [tasks](#tasks)
  - [users](#users)
  - [webhooks](#webhooks)
- [Global Options](#global-options)
- [Command Aliases](#command-aliases)
- [Web App Generator](#web-app-generator)

---

## Installation

**Requirements:** [Node.js 24.x](https://nodejs.org/en/download/current) or higher, git.

> **Tip:** We recommend installing Node.js via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) rather than a system installer. Version managers install Node in your home directory, so `npm install -g` works without `sudo` and avoids permission errors.

1. Authenticate with the GitHub Package Registry using a [GitHub Access Token](https://github.com/settings/tokens) with `repo` and `read:packages` scopes:
   ```sh
   echo "Enter your GitHub Access Token with read:packages and repo scopes:" \
     && read -s GITHUB_TOKEN \
     && npm config set @signaloid:registry https://npm.pkg.github.com/ \
     && npm config set //npm.pkg.github.com/:_authToken $GITHUB_TOKEN
   ```

2. Install the Signaloid CLI:
   ```sh
   npm install -g @signaloid/signaloid-cli
   ```

[↑ Top](#signaloid-cli)

---

## Quick Start

```sh
# 1. Log in with your Signaloid API key
#    Generate one at: signaloid.io → Settings → Cloud Engine API
signaloid-cli auth login --api-key <key>

# 2. Verify authentication
signaloid-cli auth whoami

# 3. Start using SCCE from the command line
signaloid-cli cores list
signaloid-cli repos list
signaloid-cli tasks list
```

[↑ Top](#signaloid-cli)

---

## Command Reference

[↑ Top](#signaloid-cli)

---

### auth

Manage authentication with the Signaloid Cloud Compute Engine.

#### `auth login`

Authenticate with the Signaloid Cloud Compute Engine using either an API key or an email address and password.

```
signaloid-cli auth login [--api-key [key]] [--email [email]] [--password <password>]
```

| Option | Description |
|--------|-------------|
| `--api-key [key]` | Signaloid API key. Leave blank to enter the value interactively. |
| `--email [email]` | Email address for email/password login. Leave blank to enter the value interactively. |
| `--password <password>` | Password for email/password login. |

If no options are specified, an interactive menu prompts you to choose a login method.

```sh
# API key login — recommended for scripts and long-lived sessions
signaloid-cli auth login --api-key scce_...

# Interactive prompt for the API key value
signaloid-cli auth login --api-key

# Email/password login
signaloid-cli auth login --email user@example.com --password mypass
```

#### `auth whoami`

Show information about the currently-authenticated user.

```
signaloid-cli auth whoami [--format <table|json>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--format <table\|json>` | `json` | Output format. |

#### `auth logout`

Clear local authentication credentials and sign out.

```
signaloid-cli auth logout
```

[↑ Top](#signaloid-cli)

---

### builds

Manage builds. **Aliases:** `b`, `build`

#### `builds list`

Show information about your builds.

```
signaloid-cli builds list [--status <status>] [--from <iso>] [--to <iso>] [--count <n>] [--limit <n>] [--summary] [--start-key <key>] [--format <table|json>] [--columns <cols>]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | Filter by status: `Accepted` \| `Initialising` \| `In Progress` \| `Completed` \| `Cancelled` \| `Stopped` \| `Rescheduled` |
| `--from <iso>` | Filter to builds created after this ISO 8601 timestamp (e.g. `2025-01-01T00:00:00Z`) |
| `--to <iso>` | Filter to builds created before this ISO 8601 timestamp |
| `--count <n>` | Number of items to fetch |
| `--limit <n>` | Server-side page size limit (max 25 in expanded mode, 500 with `--summary`) |
| `--summary` | Return lightweight build summaries (`{BuildID, Owner, CreatedAt}`) instead of full details. Allows a much larger page size. |
| `--start-key <key>` | Pagination cursor token (from a previous response's `ContinuationKey`) |
| `--format <table\|json>` | Output format (default: `json`) |
| `--columns <cols>` | Comma-separated list of column keys to display, or `help` to list available columns |

#### `builds get`

Show information about the specified build.

```
signaloid-cli builds get --build-id <id> [--format <table|json>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--build-id <id>` | | Build ID |
| `--format <table\|json>` | `json` | Output format |

#### `builds create:source`

Create a build from a local source file.

```
signaloid-cli builds create:source --file <path> --lang <lang> [--args <args>] [--core-id <id>] [--trace-variables <json>] [--data-sources <json>] [--public] [--discover-variables] [--config-mk <path>]
```

| Option | Description |
|--------|-------------|
| `--file <path>` | Path to the local source file |
| `--lang <lang>` | Source language: `C` \| `C++` \| `Fortran` |
| `--args <args>` | Default runtime arguments |
| `--core-id <id>` | Core ID to use for the build |
| `--trace-variables <json>` | JSON array of `TraceVariableRequest` objects, e.g. `'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]'` |
| `--data-sources <json>` | JSON array of `DataSource` objects, e.g. `'[{"Location":"/data","ResourceID":"drv_...","ResourceType":"Drive"}]'` |
| `--public` | Mark the build as publicly accessible (sets `IsPublic=true`) |
| `--discover-variables` | Request SCCE to discover traceable variables (sets `DiscoverVariables=true` query param) |
| `--config-mk <path>` | Path to a `config.mk` file |

#### `builds create:repo`

Create a build from a connected repository.

```
signaloid-cli builds create:repo --repo-id <id> [--args <args>] [--core-id <id>] [--discover-vars] [--trace-variables <json>] [--data-sources <json>] [--public | --private]
```

| Option | Description |
|--------|-------------|
| `--repo-id <id>` | Repository ID |
| `--args <args>` | Default runtime arguments |
| `--core-id <id>` | Core ID to use for the build |
| `--discover-vars` | Request SCCE to discover output variables |
| `--trace-variables <json>` | JSON array of `TraceVariable` objects, e.g. `'[{"Expression":"x[0]","File":"main.c","LineNumber":12}]'` |
| `--data-sources <json>` | JSON array of `DataSource` objects, e.g. `'[{"Location":"/data","Object":"DataSource","ResourceID":"drv_...","ResourceType":"Drive"}]'` |
| `--public` | Mark the resulting build as public |
| `--private` | Mark the resulting build as private (default) |

#### `builds status`

Show the status of the specified build.

```
signaloid-cli builds status --build-id <id>
```

#### `builds output`

Show the output from the specified build.

```
signaloid-cli builds output --build-id <id> [--out <dir>]
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID |
| `--out <dir>` | Local directory to save the output file |

#### `builds output-urls`

Get the URL of the specified build.

```
signaloid-cli builds output-urls --build-id <id>
```

#### `builds watch`

Wait for a build to finish. Exits `0` on success, `1` on failure or timeout.

```
signaloid-cli builds watch --build-id <id> [--timeout <sec>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--build-id <id>` | | Build ID |
| `--timeout <sec>` | `60` | Timeout in seconds |

#### `builds update`

Update build properties. Only the specified options are updated.

```
signaloid-cli builds update --build-id <id> {--public | --private}
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID |
| `--public` | Make the build publicly accessible |
| `--private` | Make the build private (default) |

#### `builds variables`

List the output variables discovered for a build.

```
signaloid-cli builds variables --build-id <id> [--start-key <key>]
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID |
| `--start-key <key>` | Pagination cursor token (from a previous response's `ContinuationKey`) |

#### `builds tasks`

List tasks that were run for a specific build.

```
signaloid-cli builds tasks --build-id <id> [--from <iso>] [--to <iso>] [--start-key <key>]
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID |
| `--from <iso>` | Filter to tasks created after this ISO 8601 timestamp |
| `--to <iso>` | Filter to tasks created before this ISO 8601 timestamp |
| `--start-key <key>` | Pagination cursor token (from a previous response's `ContinuationKey`) |

#### `builds binary`

Get the download URL for the compiled build binary, or download the binary directly with `--out`. Only available for `C0-microSD` and `C0-microSD-plus` core class builds.

```
signaloid-cli builds binary --build-id <id> [--out <dir>] [--filename <name>] [--url-only]
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID |
| `--out <dir>` | Directory to download the binary to. If omitted, prints the presigned URL as JSON. |
| `--filename <name>` | Override the saved filename (default: `build-<id>.bin`) |
| `--url-only` | Print only the presigned URL even when `--out` is set |

#### `builds cancel`

Cancel a running build.

```
signaloid-cli builds cancel --build-id <id>
```

#### `builds delete`

Delete a build.

```
signaloid-cli builds delete --build-id <id>

Delete the specified build.
```

[↑ Top](#signaloid-cli)

---

### buckets

Manage cloud storage buckets. **Alias:** `bkt`

#### `buckets list`

Show information about your cloud storage buckets.

```
signaloid-cli buckets list [--count <n>] [--start-key <key>] [--format <table|json>] [--columns <cols>]
```

| Option | Description |
|--------|-------------|
| `--count <n>` | Number of items to fetch |
| `--start-key <key>` | Pagination cursor token (from a previous response's `ContinuationKey`) |
| `--format <table\|json>` | Output format (default: `json`) |
| `--columns <cols>` | Comma-separated list of column keys to display, or `help` to list available columns |

#### `buckets get`

Show information about the specified cloud storage bucket.

```
signaloid-cli buckets get --bucket-id <id> [--format <table|json>]
```

#### `buckets create`

Create a new bucket.

```
signaloid-cli buckets create --name <name> --account <account> [--region <region>] [--mount-path <path>] [--read] [--write]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Bucket name |
| `--account <account>` | Account identifier |
| `--region <region>` | Cloud region (e.g. `us-east-1`) |
| `--mount-path <path>` | Mount path |
| `--read` | Enable read access |
| `--write` | Enable write access |

#### `buckets update`

Update information about the bucket. Only the specified options are updated; all others remain unchanged.

```
signaloid-cli buckets update --bucket-id <id> [--name <name>] [--account <account>] [--region <region>] [--mount-path <path>] [--read] [--write]
```

#### `buckets delete`

Delete the specified bucket.

```
signaloid-cli buckets delete --bucket-id <id>
```

[↑ Top](#signaloid-cli)

---

### completion

Generate shell tab-completion scripts.

```
signaloid-cli completion <bash|zsh|fish>
```

Add to your shell profile:

```sh
# Bash
signaloid-cli completion bash >> ~/.bash_profile

# Zsh
signaloid-cli completion zsh >> ~/.zshrc
```

[↑ Top](#signaloid-cli)

---

### cores

Manage computation cores. **Alias:** `c`

#### `cores list`

Display information about available cores in the SCCE. By default lists both built-in default cores and your custom cores.

```
signaloid-cli cores list [--default | --custom] [--format <table|json>] [--columns <cols>]
```

| Option | Description |
|--------|-------------|
| `--default` | Show only the built-in default cores |
| `--custom` | Show only your custom cores |
| `--format <table\|json>` | Output format (default: `json`) |
| `--columns <cols>` | Comma-separated list of column keys to display, or `help` to list available columns |

#### `cores get`

Show information about the specified core.

```
signaloid-cli cores get --core-id <id> [--format <table|json>]
```

#### `cores create`

Create a custom core in the SCCE.

```
signaloid-cli cores create --name <name> --class <class> --precision <n> --memory <n> --microarchitecture <arch> --correlation-tracking <mode>
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Core name |
| `--class <class>` | Core class: `C0` \| `C0Pro` \| `C0-microSD` \| `C0-microSD-plus` |
| `--precision <n>` | Precision (integer) |
| `--memory <n>` | Memory size in bytes (integer) |
| `--microarchitecture <arch>` | `Athens` \| `Atlas` \| `Bypass` \| `Reference` \| `Jupiter` |
| `--correlation-tracking <mode>` | `Autocorrelation` \| `Disable` |

#### `cores update`

Update information about the specified custom core. Only the specified options are updated; all others remain unchanged. Note that you cannot update properties of the default cores.

```
signaloid-cli cores update --core-id <id> [--name <name>] [--class <class>] [--precision <n>] [--memory <n>] [--microarchitecture <arch>] [--correlation-tracking <mode>]
```

#### `cores delete`

Delete the specified custom core.

```
signaloid-cli cores delete --core-id <id>
```

[↑ Top](#signaloid-cli)

---

### drives

Manage virtual data drives.

#### `drives list`

Display information about your virtual data drives.

```
signaloid-cli drives list [--count <n>] [--start-key <key>] [--format <table|json>] [--columns <cols>]
```

#### `drives get`

Display information about the specified drive.

```
signaloid-cli drives get --drive-id <id>
```

#### `drives create`

```
signaloid-cli drives create --name <name> [--ds <json>]... [--ds-file <path>]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Drive name |
| `--ds <json>` | DataSource as a JSON object (repeatable — pass multiple `--ds` flags to add multiple sources) |
| `--ds-file <path>` | Path to a JSON file containing an array of DataSource objects |

DataSource JSON format:
```json
{
  "ResourceID": "bkt_123",
  "ResourceType": "Bucket",
  "Location": "/"
}
```

`ResourceType` must be one of: `Gateway` | `Bucket` | `SignaloidCloudStorage`

```sh
# Single inline DataSource
signaloid-cli drives create --name MyDrive \
  --ds '{"ResourceID":"bkt_123","ResourceType":"Bucket","Location":"/"}'

# Multiple DataSources
signaloid-cli drives create --name MyDrive \
  --ds '{"ResourceID":"bkt_1","ResourceType":"Bucket","Location":"/"}' \
  --ds '{"ResourceID":"bkt_2","ResourceType":"Bucket","Location":"/data"}'

# DataSources from file
signaloid-cli drives create --name MyDrive --ds-file ./datasources.json
```

#### `drives update`

Update the specified drive's name or data sources. Only the specified options are updated; all others remain unchanged.

```
signaloid-cli drives update --drive-id <id> [--name <name>] [--ds <json>]... [--ds-file <path>]
```

#### `drives delete`

Delete the specified data drive.

```
signaloid-cli drives delete --drive-id <id>
```

[↑ Top](#signaloid-cli)

---

### files

Manage files and directories stored in Signaloid Cloud Storage. **Alias:** `f`

#### `files list`

**Alias:** `files ls`

Show information about files and directories. 

```
signaloid-cli files list [--path <dir>] [--count <n>] [--start-key <token>] [--format <table|json>] [--columns <cols>]
```

| Option | Description |
|--------|-------------|
| `--path <dir>` | Directory path to list (e.g. `datasets/`). Defaults to root. |
| `--count <n>` | Number of items to fetch |
| `--start-key <token>` | Pagination cursor token (from a previous response's `ContinuationKey`) |
| `--format <table\|json>` | Output format (default: `json`) |
| `--columns <cols>` | Comma-separated list of column keys to display, or `help` to list available columns |

#### `files get`

**Alias:** `files stat`

Show information about the specified file or directory.

```
signaloid-cli files get --path <path>
```

#### `files download`

Download a file into a local directory.

```
signaloid-cli files download --path <path> [--out <dir>] [--name <filename>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--path <path>` | | Remote file path to download |
| `--out <dir>` | `./downloads` | Local directory to save the file into |
| `--name <filename>` | Last segment of `--path` | Override the saved filename |

#### `files upload`

Specify either `--from` or `--text`.

```
signaloid-cli files upload --path <remotePath> {--from <localFile> | --text <string>}
```

| Option | Description |
|--------|-------------|
| `--path <remotePath>` | Destination path and file name (e.g. `datasets/data.csv`) |
| `--from <localFile>` | Local file to upload |
| `--text <string>` | Inline text content to upload |

#### `files mkdir`

Create a new directory in Signaloid Cloud Storage.

```
signaloid-cli files mkdir --path <path>
```

#### `files delete`

Delete a directory or file.

**Alias:** `files rm`

```
signaloid-cli files delete --path <path> [--recursive] [--directory]
```

| Option | Description |
|--------|-------------|
| `--path <path>` | Path to delete |
| `--recursive` | Recursively delete directory contents |
| `--directory` | Treat the path as a directory rather than a file |

[↑ Top](#signaloid-cli)

---

### github

Manage the GitHub integration for accessing private repositories.

#### `github status`

Display the GitHub username of the specified Signaloid user account (defaults to currently-authenticated user).

```
signaloid-cli github status [--user-id <id>]
```

#### `github connect`

Create a new GitHub integration by connecting your Signaloid account with your GitHub account.

```
signaloid-cli github connect --username <ghUser> --token <pat> [--user-id <id>]
```

| Option | Description |
|--------|-------------|
| `--username <ghUser>` | GitHub username |
| `--token <pat>` | GitHub Personal Access Token (scopes: `repo`, `read:packages`) |
| `--user-id <id>` | Target user ID (defaults to the authenticated user) |

#### `github disconnect`

Remove the GitHub integration from your account.

```
signaloid-cli github disconnect [--user-id <id>]
```

#### `github repos`

List GitHub repositories visible to the connected integration.

```
signaloid-cli github repos
```

#### `github branches`

Display information about the project branches in the specified GitHub repository.

```
signaloid-cli github branches --owner <owner> --repo <name>
```

#### `github proxy`

Proxy a raw GitHub API request through the Signaloid integration.

```
signaloid-cli github proxy --path <path> [--method <method>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--path <path>` | | GitHub API path (e.g., `user/repos`, `repos/owner/name/branches`) |
| `--method <method>` | `GET` | HTTP method: `GET` \| `POST` \| `PUT` \| `DELETE` |

[↑ Top](#signaloid-cli)

---

### health

Ping the Signaloid API and confirm it is reachable.

```
signaloid-cli health
```

[↑ Top](#signaloid-cli)

---

### init

Generate a web application front end. See [Web App Generator](#web-app-generator) for full details.

#### `init web-app`

Scaffold a new Signaloid web application with project structure and configuration files.

```
signaloid-cli init web-app [--json-input <path>] [--json-output <path>]
```

| Option | Description |
|--------|-------------|
| `--json-input <path>` | Read configuration from a JSON file instead of prompting interactively |
| `--json-output <path>` | Write the collected configuration to a JSON file |

[↑ Top](#signaloid-cli)

---

### keys

Manage your Signaloid Cloud Compute Engine API keys. **Alias:** `k`

#### `keys list`

Display information about your API keys.

```
signaloid-cli keys list [--count <n>] [--format <table|json>] [--columns <cols>]
```

#### `keys create`

Create a new API key.

```
signaloid-cli keys create --name <name> {--valid-until <iso> | --valid-for <duration>}
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Key name |
| `--valid-until <iso>` | Expiration date as ISO 8601 (e.g. `2026-12-31T23:59:59Z`). Default: no expiry. |
| `--valid-for <duration>` | Expiry as a duration from now (e.g. `7d`, `24h`, `30m`). Alternative to `--valid-until`. |

#### `keys validate`

Validate an API key. Exits `0` if valid, `1` if invalid.

```
signaloid-cli keys validate --api-key <KEY>
```

#### `keys delete`

**Alias:** `keys revoke`

```
signaloid-cli keys delete [--key-id <id> | --api-key <key>]
```

| Option | Description |
|--------|-------------|
| `--key-id <id>` | Key ID to delete. |
| `--api-key <key>` | API key to delete. |

If neither option is specified, the CLI fetches your keys and presents an interactive list. Select a key to delete or choose **Cancel** to abort.

[↑ Top](#signaloid-cli)

---

### organizations

Manage organizations, their members, and pending invitations. Alias: `orgs`.

#### `organizations get`

Display information about the specified organization.

```
signaloid-cli organizations get --org-id <id> [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--org-id <id>` | Organization ID |
| `--format <table\|json>` | Output format (default: `json`) |

#### `organizations create`

Create a new organization.

```
signaloid-cli organizations create --name <name> [--dedicated-instance <name>]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Organization name |
| `--dedicated-instance <name>` | Dedicated instance name (optional) |

#### `organizations users list`

List all users belonging to the specified organization.

```
signaloid-cli organizations users list --org-id <id>
```

#### `organizations users invite`

Invite a user to the specified organization.

```
signaloid-cli organizations users invite --org-id <id> --email <email> --role <Owner|Member>
```

| Option | Description |
|--------|-------------|
| `--org-id <id>` | Organization ID |
| `--email <email>` | Email address of the user to invite |
| `--role <Owner\|Member>` | Role to assign to the invited user |

#### `organizations users update-role`

Update the role of a user in the specified organization.

```
signaloid-cli organizations users update-role --org-id <id> --user-id <id> --role <Owner|Member>
```

| Option | Description |
|--------|-------------|
| `--org-id <id>` | Organization ID |
| `--user-id <id>` | User ID |
| `--role <Owner\|Member>` | New role for the user |

#### `organizations users remove`

Remove a user from the specified organization, or cancel a pending invitation.

```
signaloid-cli organizations users remove --org-id <id> --identifier <id-or-email>
```

| Option | Description |
|--------|-------------|
| `--org-id <id>` | Organization ID |
| `--identifier <id-or-email>` | User ID for existing members, or email address for pending invitations |

#### `organizations invitations`

List pending organization invitations for the current user.

```
signaloid-cli organizations invitations
```

[↑ Top](#signaloid-cli)

---

### plot

Plot distributions from Ux strings or task output values.

#### `plot ux-string`

Specify either `--ux-string` or `--file`.

```
signaloid-cli plot ux-string {--ux-string <ux> | --file <json>} [--out <dir>] [--out-file <path>]
```

| Option | Description |
|--------|-------------|
| `--ux-string <ux>` | Ux string value to plot |
| `--file <json>` | JSON payload file containing a Ux string |
| `--out <dir>` | Directory to save the output image |
| `--out-file <path>` | Full output file path (only valid with `--ux-string`) |

#### `plot value-id`

A value ID identifies a traced output expression from a Reference core task. Retrieve it from the task's stdout or stderr output (see `tasks output`).

Specify either `--file`, or `--task-id` with `--value-id`.

```
signaloid-cli plot value-id {--task-id <id> --value-id <id> | --file <json>} [--out <dir>] [--out-file <path>]
```

| Option | Description |
|--------|-------------|
| `--task-id <id>` | Task ID |
| `--value-id <id>` | Value ID |
| `--file <json>` | JSON file with `{ "taskID": "...", "valueID": "..." }` |
| `--out <dir>` | Directory to save the output image |
| `--out-file <path>` | Full output file path |

[↑ Top](#signaloid-cli)

---

### repos

Connect and manage code repositories. **Aliases:** `r`, `repo`

#### `repos list`

Display information about your connected repositories.

```
signaloid-cli repos list [--count <n>] [--format <table|json>] [--columns <cols>]
```

#### `repos get`

Display information about the specified repository.

```
signaloid-cli repos get --repo-id <id> [--format <table|json>]
```

#### `repos connect`

Connect a GitHub repository to your Signaloid account. To connect a private GitHub repository, make sure you have first created a GitHub account integration using `github connect`. 

```
signaloid-cli repos connect --url <gitUrl> [--branch <name>] [--commit <sha>] [--dir <path>] [--args <args>] [--core-id <id>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--url <gitUrl>` | | Remote GitHub URL (HTTPS) |
| `--branch <name>` | `main` | Branch to build |
| `--commit <sha>` | `HEAD` | Commit to build |
| `--dir <path>` | | Build directory within the repository |
| `--args <args>` | | Default runtime arguments |
| `--core-id <id>` | | Default core ID |

#### `repos lookup`

Check whether a repository is already connected for the current account by remote URL and branch.

```
signaloid-cli repos lookup --url <gitUrl> --branch <name> [--format <table|json>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--url <gitUrl>` | | Remote repository URL |
| `--branch <name>` | | Branch name |
| `--format <type>` | `json` | Output format: `table` \| `json` |

Outputs the matching `RepositoryID`, or `null` (json) / `Not found` (table) if no connection exists.

#### `repos update`

Update information about the repository. Only the specified options are updated; all others remain unchanged.

```
signaloid-cli repos update --repo-id <id> [--branch <name>] [--commit <sha>] [--dir <path>] [--args <args>] [--core-id <id>]
```

#### `repos builds`

List builds for a specific repository.

```
signaloid-cli repos builds --repo-id <id> [--from <iso>] [--to <iso>] [--count <n>] [--start-key <key>]
```

#### `repos disconnect`

Disconnect the specified repository from your Signaloid account.

```
signaloid-cli repos disconnect --repo-id <id>
```

[↑ Top](#signaloid-cli)

---

### samples

Extract numerical samples from Ux distributions.

#### `samples from-value-id`

A value ID identifies a traced output expression from a Reference core task. Retrieve it from the task's stdout or stderr output (see `tasks output`).

```
signaloid-cli samples from-value-id --task-id <id> --value-id <id> [--count <n>] [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--task-id <id>` | Task ID |
| `--value-id <id>` | Value ID |
| `--count <n>` | Number of samples to return |
| `--format <table\|json>` | Output format (default: `json`) |

#### `samples from-ux-string`

Specify either `--ux-string` or `--file`.

```
signaloid-cli samples from-ux-string {--ux-string <ux> | --file <json>} [--count <n>] [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--ux-string <ux>` | Ux string value |
| `--file <json>` | JSON file containing a Ux string |
| `--count <n>` | Number of samples to return |
| `--format <table\|json>` | Output format (default: `json`) |

[↑ Top](#signaloid-cli)

---

### tasks

Manage tasks (executions of builds). **Aliases:** `t`, `task`

#### `tasks create`

Run a new task from the specified build. Use `--public` to create a public task that can be accessed without authentication.

```
signaloid-cli tasks create --build-id <id> [--args <str>] [--params-file <file>] [--param <k=v>]... [--public]
```

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID to execute |
| `--args <str>` | Runtime arguments string |
| `--params-file <file>` | JSON file containing a full `CreateTaskRequest` payload |
| `--param <k=v>` | Inline key=value parameter (repeatable) |
| `--public` | Create a public task (accessible without authentication) |

#### `tasks list`

Display information about your tasks. You can also display information about tasks related to a specific build using `builds tasks`.

Display information about your tasks.

```
signaloid-cli tasks list [--status <status>] [--from <iso>] [--to <iso>] [--count <n>] [--start-key <key>] [--format <table|json>] [--columns <cols>]
```

| Option | Description |
|--------|-------------|
| `--status <status>` | Filter by status: `Accepted` \| `Initialising` \| `In Progress` \| `Completed` \| `Cancelled` \| `Stopped` |
| `--from <iso>` | Filter to tasks created after this ISO 8601 timestamp |
| `--to <iso>` | Filter to tasks created before this ISO 8601 timestamp |
| `--count <n>` | Number of items to fetch |
| `--start-key <key>` | Pagination cursor token (from a previous response's `ContinuationKey`) |
| `--format <table\|json>` | Output format (default: `json`) |
| `--columns <cols>` | Comma-separated list of column keys to display, or `help` to list available columns |

#### `tasks get`

Display information about the specified task. Use `--public` to fetch a public task without authentication scoping.

```
signaloid-cli tasks get --task-id <id> [--public] [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--task-id <id>` | Task ID |
| `--public` | Fetch a public task (does not require ownership of the task) |
| `--format <table\|json>` | Output format (default: `json`) |

#### `tasks status`

View the status of the specified task.

```
signaloid-cli tasks status --task-id <id>
```

#### `tasks output`

Display the text output from the specified task.

```
signaloid-cli tasks output --task-id <id> [--stream <stdout|stderr>] [--out <dir>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--task-id <id>` | | Task ID |
| `--stream <stdout\|stderr>` | `stdout` | Which output stream to fetch |
| `--out <dir>` | | Local directory to save the output file |

#### `tasks output-urls`

Display the URL of the task output. Use `--public` to fetch output URLs for a public task.

```
signaloid-cli tasks output-urls --task-id <id> [--public]
```

| Option | Description |
|--------|-------------|
| `--task-id <id>` | Task ID |
| `--public` | Fetch output URLs for a public task |

#### `tasks watch`

Wait for a task to finish. Exits `0` on success, `1` on failure or timeout.

```
signaloid-cli tasks watch --task-id <id> [--timeout <sec>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--task-id <id>` | | Task ID |
| `--timeout <sec>` | `60` | Timeout in seconds |

#### `tasks cancel`

Cancel a scheduled or running task.

```
signaloid-cli tasks cancel --task-id <id>
```

#### `tasks delete`

Delete the specified task and the information about it.

```
signaloid-cli tasks delete --task-id <id>
```

[↑ Top](#signaloid-cli)

---

### users

Manage your account.

#### `users me`

Show the current authenticated user's profile.

```
signaloid-cli users me [--format <table|json>]
```

#### `users update`

Update the current user's preferences. The API only supports updating preference fields.

```
signaloid-cli users update [--pref <key=value>]... [--payload-file <json>] [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--pref <key=value>` | Set a preference (repeatable). See allowed keys below. |
| `--payload-file <json>` | JSON file with a Preferences object to merge |
| `--format <table\|json>` | Output format (default: `json`) |

Allowed preference keys: `Editor_Theme`, `Editor_Layout`, `Editor_Layout_VariableViewer`, `Editor_SourceCode`, `Editor_Execution_Arguments`, `Editor_Execution_Core`, `Editor_Execution_DataSources`, `Editor_Execution_CodeLanguage`, `Execution_DefaultCore`, `Execution_DefaultReferenceCore`, `Execution_DefaultDataSources`.

```sh
# Update a single preference
signaloid-cli users update --pref Editor_Theme=dark

# Update multiple preferences
signaloid-cli users update --pref Editor_Theme=dark --pref Editor_Layout=horizontal
```

#### `users logs`

Fetch activity logs for the current user.

```
signaloid-cli users logs [--from <iso>] [--to <iso>] [--count <n>] [--format <table|json>]
```

#### `users logout-all`

Invalidate all active sessions for a user.

```
signaloid-cli users logout-all --user-id <id>
```

[↑ Top](#signaloid-cli)

---

### webhooks

Manage webhook endpoints.

#### `webhooks list`

Display information about your configured webhooks.

```
signaloid-cli webhooks list [--format <table|json>] [--columns <cols>]
```

#### `webhooks get`

Display information about the specified webhook.

```
signaloid-cli webhooks get --webhook-id <id> [--format <table|json>]
```

#### `webhooks create`

Create a new webhook endpoint to receive event notifications.

```
signaloid-cli webhooks create --url <url> [--events <e1,e2,...>] [--description <text>] [--status <active|disabled>] [--payload-file <json>] [--format <table|json>]
```

| Option | Description |
|--------|-------------|
| `--url <url>` | Target URL to receive webhook payloads |
| `--events <e1,e2,...>` | Comma-separated event list (e.g., `TaskStatusChange,BuildComplete`) |
| `--description <text>` | Human-readable description |
| `--status <active\|disabled>` | Initial status (default: `active`) |
| `--payload-file <json>` | JSON file with additional fields to merge into the request |
| `--format <table\|json>` | Output format (default: `json`) |

#### `webhooks update`

Update information about the webhook. Only the specified options are updated; all others remain unchanged.

```
signaloid-cli webhooks update --webhook-id <id> [--url <url>] [--events <e1,e2,...>] [--description <text>] [--status <active|disabled>] [--active] [--disabled] [--payload-file <json>] [--format <table|json>]
```

`--active` and `--disabled` are shorthand for `--status active` and `--status disabled`.

#### `webhooks enable`

Enable the specified webhook so it receives event notifications.

```
signaloid-cli webhooks enable --webhook-id <id> [--format <table|json>]
```

#### `webhooks disable`

Disable the specified webhook so it stops receiving event notifications.

```
signaloid-cli webhooks disable --webhook-id <id> [--format <table|json>]
```

#### `webhooks stats`

Display delivery statistics for your webhooks.

```
signaloid-cli webhooks stats [--format <table|json>]
```

#### `webhooks delete`

Delete the specified webhook.

```
signaloid-cli webhooks delete --webhook-id <id>
```

[↑ Top](#signaloid-cli)

---

## Global Options

Available on the top-level `signaloid-cli` command.

| Option | Default | Description |
|--------|---------|-------------|
| `--verbosity <n>` | `2` | Output verbosity level: `0` = silent, `1` = errors only, `2` = full |
| `--json` | | Machine-readable JSON output (equivalent to `--format json` on all commands) |
| `-d, --debug` | | Output extra debugging information |
| `-V, --version` | | Print the version number and exit |
| `-h, --help` | | Display help |

[↑ Top](#signaloid-cli)

---

## Command Aliases

| Alias | Full command |
|-------|-------------|
| `a` | `auth` |
| `b`, `build` | `builds` |
| `bkt` | `buckets` |
| `c` | `cores` |
| `f` | `files` |
| `k` | `keys` |
| `r`, `repo` | `repos` |
| `t`, `task` | `tasks` |

```sh
# These are equivalent
signaloid-cli tasks list --status Completed
signaloid-cli t list --status Completed
```

[↑ Top](#signaloid-cli)

---

## Web App Generator

The `init web-app` command generates a graphical web interface for a C/C++ application that uses Signaloid's UxHw API, to help visualize how changes in input parameter distributions affect the distribution of the application's outputs. The generated web application interacts with the Signaloid Cloud Compute Engine to launch accelerated executions of the back-end application and return its results.

### Requirements

- A [Signaloid API key](https://signaloid.io/settings/api). Sign in to the [Signaloid Cloud Developer Platform](https://signaloid.io) and go to `Settings > Cloud Engine API`.
- A [GitHub Access Token](https://github.com/settings/tokens) with `repo` and `read:packages` scopes. See [GitHub docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
- To run applications from private repositories, [sign in to GitHub from the Signaloid Cloud Developer Platform](https://docs.signaloid.io/docs/platform/user-interface/repositories/github-login/).

### C/C++ Application Requirements

To generate a web app, the back-end C/C++ application must:

- Accept command-line arguments
- Export output in JSON format
- Be stored in a GitHub repository

Signaloid provides [common utility routines](https://github.com/signaloid/Signaloid-Demo-CommonUtilityRoutines) — a small library that can parse arguments and prepare JSON output. See this [minimal C code application](https://github.com/signaloid/Signaloid-CLI-Demo-C-Template/blob/main/src/main.c) for a working example. It has an input parameter `commandLineArgDistributionalInput` with argument flag `-k`, uses `parseDoubleChecked` to parse both scalar values and [Ux Strings](https://docs.signaloid.io/docs/uxhw-api/ux-data-format/), and uses `jsonOutputVariables` and `printJSONVariables` from `common.h` to format the output as JSON.

You can also use the [Battery State Estimation Application](https://github.com/signaloid/Signaloid-Demo-Batteries-StateOfChargeEstimation) or any other application you have created, provided it has appropriate inputs and outputs.

### Usage

```sh
signaloid-cli init web-app
```

Follow the prompts. Default values are provided for all inputs.

> **Note:** For the default Signaloid C application, leave all options at their default values.

| Prompt | Default | Description |
|--------|---------|-------------|
| Project name | `signaloid-cli-demo` | Local directory for the generated web app |
| Title | — | Title displayed at the top of the web app |
| Short description | — | Description displayed below the title |
| Core ID | C0Pro-M+ core ID | See `signaloid-cli cores list --default` |
| GitHub repository URL | `https://github.com/signaloid/Signaloid-CLI-Demo-C-Template` | HTTPS URL of the repository |
| Commit | `HEAD` | Git commit to build |
| Branch | `main` | Git branch to build |
| Build directory | `src/` | Directory in the repository containing the source code |
| Application arguments | _(empty)_ | Optional command-line arguments passed to the application |

### Interactive Inputs

Your web app can have one or more interactive inputs that dynamically pass data to the C/C++ application. When prompted:

```
⚙️  Configuring interactive inputs...
✔ How many inputs will your application have?
```

> **Note:** For the default Signaloid C application, create 1 input of type "distributional slider" with argument flag `-k`.

For each input, specify:

- **Type** — the front-end element and its data type:
  - Basic slider: a single numeric value. ![Animation of a basic slider](assets/slider-basic.gif)
  - Distributional slider: a numeric distribution. ![Animation of a distributional slider](assets/slider-distributional.gif)
  - Number input: a box to enter a number.
  - Multiple choice: a radio button to choose one of the defined options.
- **Argument flag** — the command-line option that passes this input to the C/C++ application.

![Diagram of a distributional slider, showing the name of each component.](assets/slider-elements.png)

### Running the Generated App

```sh
cd <project-name>
npm start
```

![Animation showing how to install Signaloid CLI and configure a new web application using the default C application.](assets/cli-tool-installation.gif)

*This animation shows how to install Signaloid CLI and configure a new web application using the default Signaloid C application.*
