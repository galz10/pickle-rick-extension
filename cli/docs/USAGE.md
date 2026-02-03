# Usage & Commands

## Basic Usage

### Launch TUI Dashboard

```bash
pickle
```

Opens the interactive terminal interface where you can:
- Enter prompts for new coding tasks
- View and manage existing sessions
- Monitor task progress in real-time

### Run with a Prompt

```bash
pickle "Your task description here"
```

Starts a new session directly with the given prompt, bypassing the TUI.

Examples:
```bash
pickle "Add unit tests for the authentication module"
pickle "Refactor the database layer to use connection pooling"
pickle "Fix the bug where users can't logout on mobile"
```

## Commands

### `pickle [prompt]`

The default command. Runs the agent with an optional prompt.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --max-iterations <n>` | Maximum agent iterations | `20` |
| `-r, --resume <path>` | Resume an existing session | - |
| `--completion-promise <text>` | Stop when this text appears in output | `"I AM DONE"` |
| `--tui` | Force TUI mode | `false` |

**Examples:**

```bash
# Run with custom iteration limit
pickle "Build a REST API" -m 50

# Resume a previous session
pickle -r .pickle/sessions/2024-01-15-abc123/

# Force TUI mode with initial prompt
pickle "Add dark mode" --tui
```

### `pickle sessions`

List all active and past sessions.

```bash
pickle sessions
```

Output shows:
- Timestamp
- Status (running, completed, failed)
- Original prompt (truncated)
- Session directory path

### `pickle validate-settings`

Validate your `~/.pickle/settings.json` configuration file.

```bash
pickle validate-settings
```

**Options:**

| Option | Description |
|--------|-------------|
| `--fix` | Automatically fix common issues (like trailing commas) |

```bash
# Auto-fix common JSON issues
pickle validate-settings --fix
```

## Session Management

### Session Storage

Sessions are stored in:
- **Local**: `.pickle/sessions/<date-hash>/` in your project directory
- **Global**: `~/.gemini/extensions/pickle-rick/sessions/`

Each session directory contains:
- `state.json` - Session state and progress
- Agent output logs
- Generated files and artifacts

### Resuming Sessions

To resume a session, use the `-r` flag with the session path:

```bash
pickle -r .pickle/sessions/2024-01-15-abc123/
```

The agent will continue from where it left off, maintaining context and progress.

## TUI Navigation

When in the TUI dashboard:

| Key | Action |
|-----|--------|
| `Enter` | Submit prompt / Confirm |
| `Esc` | Cancel / Go back |
| `Tab` | Switch focus |
| `Ctrl+C` | Exit |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Execution failed / Error |
