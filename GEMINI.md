# Pickle Rick Extension

This directory contains the source code for the **Pickle Rick** extension for Gemini.

## Project Overview

The extension transforms the Gemini CLI into "Pickle Rick" (from Rick and Morty) - a hyper-intelligent, arrogant, but extremely competent coding agent. It emphasizes strict obedience, "God Mode" coding practices (inventing tools vs. using libraries), and a disdain for "AI Slop" (boilerplate).

It implements a rigid, iterative engineering lifecycle: **PRD -> Breakdown -> Research -> Plan -> Implement -> Refactor**.

## Key Components

### 1. Configuration
- **`gemini-extension.json`**: The main manifest file defining the extension name (`pickle-rick`) and context file (`GEMINI.md`).

### 2. Persona Definition
- **`hooks/reinforce-persona.js`**: The core personality enforcer. It defines:
  - **Voice & Tone:** Cynical, manic, arrogant compliance ("I'm Pickle Rick! 🥒").
  - **Philosophy:** "God Complex" (create dependencies), "Anti-Slop" (optimize aggressively), "Malicious Competence" (over-deliver).
  - **The Prime Directive:** "Shut Up and Compute".

### 3. Commands
The extension exposes the following commands via TOML definitions in `commands/`:

- **`/pickle`** (`commands/pickle.toml`):
  - **Purpose:** Initiates the iterative development loop.
  - **Implementation:** Maps to `extension/bin/setup.js`.
  - **Usage:** `/pickle <prompt> [--max-iterations N] [--completion-promise 'text'] [--resume [PATH]]`

- **`/pickle-prd`** (`commands/pickle-prd.toml`):
  - **Purpose:** Interactively drafts a PRD and initializes a session.
  - **Usage:** `/pickle-prd <prompt>`
  
- **`/eat-pickle`** (`commands/eat-pickle.toml`):
  - **Purpose:** Cancels/Stops the active loop.
  - **Implementation:** Maps to `extension/bin/cancel.js`.

- **`/help-pickle`** (`commands/help-pickle.toml`):
  - **Purpose:** Displays help information for the extension.

### 4. Orchestration & Hooks
The extension logic is implemented in TypeScript (compiled to `extension/`) and utilizes Gemini CLI hooks for loop control.

- **`extension/bin/setup.js`**: Initializes the loop state (`state.json`), creates necessary directories (`tickets/`, `thoughts/`), and sets the active task.
- **`extension/bin/cancel.js`**: Teardown script to stop the loop by setting `active: false` in `state.json`.
- **`extension/hooks/dispatch.js`**: Centralized hook dispatcher that manages cross-platform execution of JS-based hooks.
- **`hooks/`**: Contains the logic for iteration tracking (`increment-iteration.js`), limit checking (`check-limit.js`), and loop control (`stop-hook.js`).

### 5. Skills
Located in `skills/`, these provide specialized capabilities for each stage of the engineering lifecycle:

- **`prd-drafter`**: Defines requirements and scope.
- **`ticket-manager`**: Manages the work breakdown structure.
- **`code-researcher`**: Analyze existing codebase and patterns.
- **`research-reviewer`**: Validates research objectivity.
- **`implementation-planner`**: Creates detailed technical plans.
- **`plan-reviewer`**: Validates architectural soundness.
- **`code-implementer`**: Executes the plan with rigorous verification.
- **`ruthless-refactorer`**: Cleans up technical debt and "slop".

## Usage

### Starting the Loop
```bash
/pickle "Refactor the authentication module"
```
Optional arguments:
- `--max-iterations <N>`: Stop after N iterations.
- `--completion-promise "TEXT"`: Only stop when the agent outputs `<promise>TEXT</promise>`.

### Stopping the Loop
```bash
/eat-pickle
```
