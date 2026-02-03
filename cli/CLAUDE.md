# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Run in development mode (TUI dashboard)
bun run dev

# Build production executable
bun run build

# Type check without emitting
bun run check

# Run tests
bun test

# Run single test file
bun test src/path/to/file.test.ts
```

## Architecture Overview

Pickle Rick CLI is an autonomous coding agent orchestrator with a TUI (Terminal UI) interface built on `@opentui/core`. It executes tasks through the Gemini CLI in isolated git worktrees.

### Core Flow

1. **Entry Point** (`src/index.ts`): CLI commands using Commander.js
   - Default action launches TUI dashboard
   - `pickle` command runs agent with optional prompt or resume
   - `sessions` lists past sessions

2. **Session & Settings Management** (`src/config/`):
   - Sessions stored in `.pickle/sessions/<date-hash>/`
   - State persisted as `state.json` with Zod validation
   - Global sessions also at `~/.gemini/extensions/pickle-rick/sessions/`
   - User settings at `~/.pickle/settings.json` (provider/model configuration)

3. **Execution Pipeline** (`src/execution/`):
   - `SequentialExecutor`: Main orchestration loop
   - `PickleTaskSource`: Task state machine managing phases (prd → breakdown → tickets)
   - Creates isolated git worktrees for each session to avoid conflicts

4. **AI Providers** (`src/providers/`):
   - `GeminiProvider`: Wraps Gemini CLI with streaming JSON output
   - `OpencodeProvider`: Alternative provider using opencode CLI
   - Provider selected via `~/.pickle/settings.json` or defaults to Gemini
   - Temporarily disables pickle-rick extension during execution to prevent recursion
   - Supports session resumption via `resumeSessionId`

5. **TUI Components** (`src/ui/`):
   - `dashboard.ts`: Main dashboard composition
   - `DashboardController`: Manages session spawning and UI state
   - `LandingView`: Initial prompt entry view
   - Built with @opentui/core renderables (BoxRenderable, TextRenderable, etc.)

### Task State Machine

The agent progresses through phases:
- **prd**: Draft Product Requirements Document
- **breakdown**: Create atomic tickets from PRD
- **research/plan/implement/refactor**: Execute individual tickets
- **done**: All tasks completed

### Git Worktree Isolation

Sessions execute in isolated worktrees:
- Created at `.pickle/worktrees/session-<name>/`
- Project state synced via rsync (excluding `.git`, `.pickle`)
- Session context mirrored inside worktree for sandbox bypass
- Offers merge back to base branch on completion

### Key Patterns

- Streaming output parsed as JSON lines from Gemini CLI
- Progress callbacks for TUI spinner updates
- State reloaded from disk after each iteration to capture external changes
- Completion detected via `<promise>I AM DONE</promise>` or `[STOP_TURN]` markers
