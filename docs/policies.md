# Policies

Gemini CLI includes a [policy engine](https://geminicli.com/docs/core/policy-engine/) which can be configured to allow or deny execution of tools.

If you like to live dangerously, you can permit Pickle Rick to take control over a subset of tools.

An example policy placed at `~/.gemini/policies/pickle_rick.toml` might look like the following example;

```toml
# ---------------------------------------------------------
# PICKLE RICK "GOD MODE" POLICIES 🥒
# ---------------------------------------------------------

# Reference:
# https://geminicli.com/docs/core/policy-engine/#system-wide-policies-admin

# 1. Unleash Morty (The Worker)
# Allows the Python script that runs the sub-agent to execute.
[[rule]]
toolName = "run_shell_command"
commandRegex = ".*spawn_morty\\.py.*"
decision = "allow"
priority = 100

# 2. Basic Engineering Senses
# Allows Morty to see and touch files without asking "Mother, may I?" every time.
[[rule]]
toolName = [
    "read_file",
    "write_file",
    "replace",
    "glob",
    "list_directory",
    "search_file_content",
    "create_or_update_file",
    "delete_file"
]
decision = "allow"
priority = 95

# 3. Define the Tool Belt you permit.
# Allows standard dev commands.
[[rule]]
toolName = "run_shell_command"
commandPrefix = [
    "git",
    "npm",
    "node",
    "bun",
    "cargo",
    "devenv",
    "op",
    "pre-commit",
    "mkdir",
    "rm",
    "cp",
    "mv",
    "touch"
]
decision = "allow"
priority = 90

# 4. Agent Delegation
# Allows Pickle Rick to spawn sub-agents (codebase_investigator, etc.) if needed.
[[rule]]
toolName = "delegate_to_agent"
decision = "allow"
priority = 85
```

