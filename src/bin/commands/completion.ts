import { Command } from "commander";
import { useGhStyleHelp, addLearnMore, addExamples } from "../utils/help-formatter";

/**
 * Generates shell completion scripts for bash, zsh, and fish.
 *
 * This command provides shell completion functionality to autocomplete
 * commands, subcommands, and flags in the user's shell.
 *
 * @param program - The Commander program instance to register commands with
 *
 * @example
 * ```
 * # Install bash completion
 * signaloid-cli completion bash > /etc/bash_completion.d/signaloid-cli
 * source /etc/bash_completion.d/signaloid-cli
 *
 * # Install zsh completion
 * signaloid-cli completion zsh > /usr/local/share/zsh/site-functions/_signaloid-cli
 *
 * # Install fish completion
 * signaloid-cli completion fish > ~/.config/fish/completions/signaloid-cli.fish
 * ```
 */
export default function completion(program: Command) {
	const cmd = program
		.command("completion")
		.description("Generate shell completion scripts");

	useGhStyleHelp(cmd);
	addLearnMore(cmd, "https://docs.signaloid.io/docs/api/signaloid-cli/intro");
	addExamples(cmd, [
		{
			description: "Generate bash completion and save to file",
			command: "signaloid-cli completion bash > ~/.bash_completion.d/signaloid-cli",
		},
		{
			description: "Generate zsh completion",
			command: "signaloid-cli completion zsh > /usr/local/share/zsh/site-functions/_signaloid-cli",
		},
		{
			description: "Generate fish completion",
			command: "signaloid-cli completion fish > ~/.config/fish/completions/signaloid-cli.fish",
		},
	]);

	cmd.command("bash")
		.description("Generate bash completion script")
		.action(() => {
			console.log(generateBashCompletion());
		});

	cmd.command("zsh")
		.description("Generate zsh completion script")
		.action(() => {
			console.log(generateZshCompletion());
		});

	cmd.command("fish")
		.description("Generate fish completion script")
		.action(() => {
			console.log(generateFishCompletion());
		});
}

/**
 * Generate bash completion script
 */
function generateBashCompletion(): string {
	return `#!/usr/bin/env bash

# Bash completion for signaloid-cli
# To install:
#   signaloid-cli completion bash > /etc/bash_completion.d/signaloid-cli
#   source /etc/bash_completion.d/signaloid-cli

_signaloid_cli_completion() {
    local cur prev words cword
    _init_completion || return

    local commands="init auth health builds tasks buckets files repos keys cores drives plot samples users webhooks github completion help"
    local global_opts="--help --version --debug --json --verbosity"

    # Subcommands for each command
    local auth_cmds="login whoami logout"
    local builds_cmds="list create:source create:repo get status output-urls output watch cancel delete"
    local tasks_cmds="create list get status output-urls output cancel delete watch"
    local cores_cmds="list get create update delete"
    local repos_cmds="list get connect update disconnect builds"
    local buckets_cmds="list get create delete"
    local files_cmds="list upload download delete"
    local keys_cmds="list create delete"
    local drives_cmds="list get create update delete"
    local samples_cmds="from-value-id from-ux-string"
    local plot_cmds="ux-string value-id"
    local webhooks_cmds="list create delete"
    local users_cmds="me update logs logout-all"
    local github_cmds="login logout status"
    local init_cmds="web-app"
    local completion_cmds="bash zsh fish"

    case "\${words[1]}" in
        auth)
            COMPREPLY=( \$(compgen -W "\$auth_cmds \$global_opts" -- "\$cur") )
            ;;
        builds)
            COMPREPLY=( \$(compgen -W "\$builds_cmds \$global_opts" -- "\$cur") )
            ;;
        tasks)
            COMPREPLY=( \$(compgen -W "\$tasks_cmds \$global_opts" -- "\$cur") )
            ;;
        cores)
            COMPREPLY=( \$(compgen -W "\$cores_cmds \$global_opts" -- "\$cur") )
            ;;
        repos)
            COMPREPLY=( \$(compgen -W "\$repos_cmds \$global_opts" -- "\$cur") )
            ;;
        buckets)
            COMPREPLY=( \$(compgen -W "\$buckets_cmds \$global_opts" -- "\$cur") )
            ;;
        files)
            COMPREPLY=( \$(compgen -W "\$files_cmds \$global_opts" -- "\$cur") )
            ;;
        keys)
            COMPREPLY=( \$(compgen -W "\$keys_cmds \$global_opts" -- "\$cur") )
            ;;
        drives)
            COMPREPLY=( \$(compgen -W "\$drives_cmds \$global_opts" -- "\$cur") )
            ;;
        samples)
            COMPREPLY=( \$(compgen -W "\$samples_cmds \$global_opts" -- "\$cur") )
            ;;
        plot)
            COMPREPLY=( \$(compgen -W "\$plot_cmds \$global_opts" -- "\$cur") )
            ;;
        webhooks)
            COMPREPLY=( \$(compgen -W "\$webhooks_cmds \$global_opts" -- "\$cur") )
            ;;
        users)
            COMPREPLY=( \$(compgen -W "\$users_cmds \$global_opts" -- "\$cur") )
            ;;
        github)
            COMPREPLY=( \$(compgen -W "\$github_cmds \$global_opts" -- "\$cur") )
            ;;
        init)
            COMPREPLY=( \$(compgen -W "\$init_cmds \$global_opts" -- "\$cur") )
            ;;
        completion)
            COMPREPLY=( \$(compgen -W "\$completion_cmds \$global_opts" -- "\$cur") )
            ;;
        *)
            COMPREPLY=( \$(compgen -W "\$commands \$global_opts" -- "\$cur") )
            ;;
    esac
}

complete -F _signaloid_cli_completion signaloid-cli
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
	return `#compdef signaloid-cli

# Zsh completion for signaloid-cli
# To install:
#   signaloid-cli completion zsh > /usr/local/share/zsh/site-functions/_signaloid-cli
#   Add /usr/local/share/zsh/site-functions to fpath in ~/.zshrc

_signaloid_cli() {
    local -a commands
    commands=(
        'init:Initialize a new Signaloid project'
        'auth:Authenticate with Signaloid Cloud Compute Engine'
        'health:Check API health and connectivity'
        'builds:Create and manage source code builds'
        'tasks:Create and manage execution tasks'
        'buckets:Manage cloud storage buckets'
        'files:Upload, download, and manage files in cloud storage'
        'repos:Connect and manage code repositories'
        'keys:Create and manage API keys for authentication'
        'cores:Manage computation cores and configurations'
        'drives:Manage virtual drives and data sources'
        'plot:Generate plots and visualizations from data'
        'samples:Retrieve statistical samples from task outputs'
        'users:View and manage user account information'
        'webhooks:Configure webhooks for event notifications'
        'github:Connect and manage GitHub integration'
        'completion:Generate shell completion scripts'
        'help:Display help for command'
    )

    local -a global_opts
    global_opts=(
        '--help[Show help for command]'
        '--version[Output the version number]'
        '--debug[Output extra debugging]'
        '--json[Machine-readable JSON output]'
        '--verbosity[Output verbosity level\: 0=silent, 1=errors only, 2=full]:n'
    )

    _arguments -C \
        $global_opts \
        '1: :->cmds' \
        '*:: :->args'

    case $state in
        cmds)
            _describe 'command' commands
            ;;
        args)
            case $words[1] in
                auth)
                    local -a auth_cmds
                    auth_cmds=(
                        'login:Login via API key or email/password'
                        'whoami:Show current identity'
                        'logout:Clear local auth and sign out'
                    )
                    _describe 'auth command' auth_cmds
                    ;;
                builds)
                    local -a builds_cmds
                    builds_cmds=(
                        'list:List builds'
                        'create\:source:Create a build from a local source file'
                        'create\:repo:Create a build from a repository'
                        'get:Get a single build'
                        'status:Get build status'
                        'output-urls:Print URLs to build outputs'
                        'output:Print build output'
                        'watch:Wait for completion and print outputs'
                        'cancel:Cancel a running build'
                        'delete:Delete a build'
                    )
                    _describe 'builds command' builds_cmds
                    ;;
                tasks)
                    local -a tasks_cmds
                    tasks_cmds=(
                        'create:Create a task from a build'
                        'list:List tasks'
                        'get:Get one task'
                        'status:Get task status'
                        'output-urls:Print URLs to task outputs'
                        'output:Download task output as text'
                        'cancel:Cancel a running task'
                        'delete:Delete a task'
                        'watch:Wait for task to reach a terminal state'
                    )
                    _describe 'tasks command' tasks_cmds
                    ;;
                cores)
                    local -a cores_cmds
                    cores_cmds=(
                        'list:List available cores'
                        'get:Get details of a specific core'
                        'create:Create a new custom core configuration'
                        'update:Update an existing core configuration'
                        'delete:Delete a custom core'
                    )
                    _describe 'cores command' cores_cmds
                    ;;
                repos)
                    local -a repos_cmds
                    repos_cmds=(
                        'list:List repositories'
                        'get:Get a repository by ID'
                        'connect:Connect a repository'
                        'update:Update repository metadata'
                        'disconnect:Disconnect a repository'
                        'builds:List builds for a repository'
                    )
                    _describe 'repos command' repos_cmds
                    ;;
                init)
                    local -a init_cmds
                    init_cmds=(
                        'web-app:Creates application structure'
                    )
                    _describe 'init command' init_cmds
                    ;;
                completion)
                    local -a completion_cmds
                    completion_cmds=(
                        'bash:Generate bash completion script'
                        'zsh:Generate zsh completion script'
                        'fish:Generate fish completion script'
                    )
                    _describe 'completion command' completion_cmds
                    ;;
            esac
            ;;
    esac
}

_signaloid_cli "$@"
`;
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(): string {
	return `# Fish completion for signaloid-cli
# To install:
#   signaloid-cli completion fish > ~/.config/fish/completions/signaloid-cli.fish

# Global options
complete -c signaloid-cli -l help -d 'Show help for command'
complete -c signaloid-cli -l version -d 'Output the version number'
complete -c signaloid-cli -l debug -d 'Output extra debugging'
complete -c signaloid-cli -l json -d 'Machine-readable JSON output'
complete -c signaloid-cli -l verbosity -d 'Output verbosity level: 0=silent, 1=errors only, 2=full'

# Main commands
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a init -d 'Initialize a new Signaloid project'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a auth -d 'Authenticate with Signaloid Cloud Compute Engine'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a health -d 'Check API health and connectivity'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a builds -d 'Create and manage source code builds'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a tasks -d 'Create and manage execution tasks'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a buckets -d 'Manage cloud storage buckets'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a files -d 'Upload, download, and manage files'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a repos -d 'Connect and manage code repositories'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a keys -d 'Create and manage API keys'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a cores -d 'Manage computation cores and configurations'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a drives -d 'Manage virtual drives and data sources'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a plot -d 'Generate plots and visualizations'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a samples -d 'Retrieve statistical samples'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a users -d 'View and manage user information'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a webhooks -d 'Configure webhooks for events'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a github -d 'Connect and manage GitHub integration'
complete -c signaloid-cli -f -n '__fish_use_subcommand' -a completion -d 'Generate shell completion scripts'

# auth subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from auth' -a login -d 'Login via API key or email/password'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from auth' -a whoami -d 'Show current identity'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from auth' -a logout -d 'Clear local auth and sign out'

# builds subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a list -d 'List builds'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a 'create:source' -d 'Create build from local source'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a 'create:repo' -d 'Create build from repository'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a get -d 'Get a single build'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a status -d 'Get build status'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a output -d 'Print build output'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a watch -d 'Wait for completion'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a cancel -d 'Cancel a running build'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from builds' -a delete -d 'Delete a build'

# tasks subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a create -d 'Create a task from a build'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a list -d 'List tasks'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a get -d 'Get one task'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a status -d 'Get task status'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a output -d 'Download task output'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a cancel -d 'Cancel a running task'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a delete -d 'Delete a task'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from tasks' -a watch -d 'Wait for completion'

# cores subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from cores' -a list -d 'List available cores'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from cores' -a get -d 'Get core details'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from cores' -a create -d 'Create custom core'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from cores' -a update -d 'Update core configuration'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from cores' -a delete -d 'Delete custom core'

# repos subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a list -d 'List repositories'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a get -d 'Get repository by ID'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a connect -d 'Connect a repository'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a update -d 'Update repository metadata'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a disconnect -d 'Disconnect a repository'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from repos' -a builds -d 'List repository builds'

# init subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from init' -a web-app -d 'Create application structure'

# completion subcommands
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from completion' -a bash -d 'Generate bash completion'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from completion' -a zsh -d 'Generate zsh completion'
complete -c signaloid-cli -f -n '__fish_seen_subcommand_from completion' -a fish -d 'Generate fish completion'
`;
}
