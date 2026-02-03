# Architecture

## Overview

Pickle Rick CLI is an autonomous coding agent orchestrator with a TUI (Terminal UI) interface built on `@opentui/core`. It executes tasks through AI providers (like Gemini CLI) in isolated git worktrees.

## Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Entry Point                         │
│                      (src/index.ts)                          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     TUI Dashboard       │     │      CLI Mode           │
│     (src/ui/)           │     │   (direct execution)    │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Sequential Executor                        │
│              (src/services/execution/sequential.ts)          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Task Source     │ │  AI Provider │ │  Git Services    │
│  (pickle-source) │ │  (providers/)│ │  (git/)          │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

## Data Flow

### 1. Entry Point (`src/index.ts`)

CLI commands using Commander.js:
- Default action launches TUI dashboard
- `pickle` command runs agent with optional prompt or resume
- `sessions` lists past sessions

### 2. Session & Settings Management (`src/services/config/`)

- Sessions stored in `.pickle/sessions/<date-hash>/`
- State persisted as `state.json` with Zod validation
- Global sessions also at `~/.gemini/extensions/pickle-rick/sessions/`
- User settings at `~/.pickle/settings.json` (provider/model configuration)

### 3. Execution Pipeline (`src/services/execution/`)

- **SequentialExecutor**: Main orchestration loop
- **PickleTaskSource**: Task state machine managing phases
- Creates isolated git worktrees for each session to avoid conflicts

### 4. AI Providers (`src/services/providers/`)

- **GeminiProvider**: Wraps Gemini CLI with streaming JSON output
- **OpencodeProvider**: Alternative provider using opencode CLI
- Provider selected via `~/.pickle/settings.json` or defaults to Gemini
- Temporarily disables pickle-rick extension during execution to prevent recursion
- Supports session resumption via `resumeSessionId`

### 5. TUI Components (`src/ui/`)

- **dashboard.ts**: Main dashboard composition
- **DashboardController**: Manages session spawning and UI state
- **LandingView**: Initial prompt entry view
- Built with @opentui/core renderables (BoxRenderable, TextRenderable, etc.)

## Task State Machine

The agent progresses through phases:

```
┌─────┐     ┌───────────┐     ┌──────────┐
│ prd │ ──▶ │ breakdown │ ──▶ │ research │
└─────┘     └───────────┘     └──────────┘
                                   │
                                   ▼
┌──────┐     ┌───────────┐     ┌──────┐
│ done │ ◀── │  refactor │ ◀── │ plan │
└──────┘     └───────────┘     └──────┘
                   ▲               │
                   │               ▼
                   │         ┌───────────┐
                   └──────── │ implement │
                             └───────────┘
```

- **prd**: Draft Product Requirements Document
- **breakdown**: Create atomic tickets from PRD
- **research**: Investigate codebase and gather context
- **plan**: Design implementation approach
- **implement**: Write the code
- **refactor**: Clean up and optimize
- **done**: All tasks completed

## Git Worktree Isolation

Sessions execute in isolated worktrees to prevent conflicts:

```
project/
├── .git/                    # Main repository
├── .pickle/
│   ├── sessions/            # Session state
│   │   └── 2024-01-15-abc/
│   │       └── state.json
│   └── worktrees/           # Isolated worktrees
│       └── session-abc/     # Full copy of project
│           ├── .git         # Worktree link
│           └── ...          # Synced project files
└── src/                     # Main project source
```

- Created at `.pickle/worktrees/session-<name>/`
- Project state synced via rsync (excluding `.git`, `.pickle`)
- Session context mirrored inside worktree for sandbox bypass
- Offers merge back to base branch on completion

## Key Patterns

### Streaming Output

Output from AI providers is parsed as JSON lines:

```typescript
provider.execute(prompt, (chunk) => {
  // Real-time streaming callback
  updateSpinner(chunk);
});
```

### Progress Callbacks

TUI spinners update via callbacks:

```typescript
const executor = new SequentialExecutor(state, provider, (progress) => {
  spinner.update(progress.message);
});
```

### State Persistence

State is reloaded from disk after each iteration to capture external changes:

```typescript
// After each iteration
state = await loadState(sessionPath);
```

### Completion Detection

Detected via markers in output:
- `<promise>I AM DONE</promise>`
- `[STOP_TURN]`

## Directory Structure

```
src/
├── index.ts              # CLI entry point
├── services/
│   ├── commands/         # Worker commands
│   ├── config/           # Settings & state management
│   │   ├── settings.ts   # User settings (~/.pickle/settings.json)
│   │   ├── state.ts      # Session state management
│   │   └── types.ts      # Zod schemas
│   ├── execution/        # Orchestration
│   │   ├── sequential.ts # Main executor loop
│   │   ├── pickle-source.ts # Task state machine
│   │   └── prompt.ts     # Prompt generation
│   ├── git/              # Git operations
│   │   ├── worktree.ts   # Worktree management
│   │   ├── diff.ts       # Diff viewing
│   │   ├── pr.ts         # PR creation
│   │   └── branch.ts     # Branch operations
│   └── providers/        # AI provider integrations
│       ├── base.ts       # Base provider interface
│       ├── gemini.ts     # Gemini CLI provider
│       ├── codex.ts      # Codex provider
│       └── index.ts      # Provider factory
├── ui/                   # TUI components
│   ├── dashboard.ts      # Main dashboard
│   ├── views/            # View components
│   ├── dialogs/          # Modal dialogs
│   ├── components/       # Reusable UI components
│   └── controllers/      # UI state controllers
├── games/                # Easter egg games
└── utils/                # Utility functions
```
