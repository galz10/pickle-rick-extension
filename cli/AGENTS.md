# AGENTS.md

This file provides guidance for agentic coding agents working in this repository.

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

## Code Style Guidelines

### General Principles
- **TypeScript**: All code must be TypeScript with strict mode enabled
- **ESM**: Use ES modules with `.js` extensions for imports (not `.ts`)
- **Async/Await**: Prefer async/await over Promise chains
- **Error Handling**: Use try/catch with proper error typing and messages

### Import Organization
```typescript
// 1. Node.js built-ins
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 2. External dependencies
import { Command } from "commander";
import { z } from "zod";

// 3. Internal modules (relative imports with .js)
import { SessionState } from "./config/types.js";
import { GeminiEngine } from "./engines/gemini.js";
```

### Naming Conventions
- **Files**: kebab-case for files (e.g., `dashboard-controller.ts`)
- **Classes**: PascalCase (e.g., `DashboardController`, `GeminiEngine`)
- **Functions/Variables**: camelCase (e.g., `createSession`, `sessionDir`)
- **Constants**: UPPER_SNAKE_CASE for exports (e.g., `GLOBAL_SESSIONS_DIR`)
- **Interfaces**: PascalCase with `I` prefix only for React-like props (e.g., `DashboardUI`)

### Type Safety
- **Zod**: Use Zod schemas for all external data validation
- **Strict Types**: Always define explicit return types and parameter types
- **Error Types**: Use `unknown` for catch blocks, then narrow with `instanceof`

```typescript
// Good
async function loadState(sessionDir: string): Promise<SessionState | null> {
  try {
    const content = await readFile(path, "utf-8");
    const json = JSON.parse(content);
    return SessionStateSchema.parse(json);
  } catch (e) {
    console.error("Failed to load state:", e);
    return null;
  }
}

// Bad
async function loadState(path) {
  try {
    return JSON.parse(await readFile(path));
  } catch (e) {
    return null;
  }
}
```

### Code Organization
- **Barrel Exports**: Use `index.ts` files for clean public APIs
- **Single Responsibility**: Each file should export one main class/function
- **Dependencies**: Inject dependencies, avoid global state
- **Constants**: Define theme and configuration constants in dedicated files

### TUI Components (@opentui/core)
- **Renderables**: All UI components extend renderable classes
- **Event Handling**: Use proper event listener patterns with cleanup
- **State Management**: Keep UI state in controller classes, not renderables
- **Theme**: Use centralized theme constants from `./theme.js`

### Testing
- **Framework**: Use Bun's built-in test runner
- **Structure**: Group tests with `describe()`, use descriptive test names
- **Coverage**: Test public interfaces, not implementation details
- **Mocking**: Mock external dependencies (file system, network, CLI commands)

### Error Handling Patterns
```typescript
// CLI commands
try {
  await executor.run();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(pc.red(`💥 Execution failed: ${msg}`));
  process.exit(1);
}

// File operations
try {
  await writeFile(path, content, "utf-8");
} catch (e) {
  throw new Error(`Failed to write state to ${path}: ${e}`);
}
```

### Git & Session Management
- **Worktrees**: Sessions execute in isolated git worktrees
- **State Persistence**: All state must be serializable to JSON via Zod schemas
- **Cleanup**: Always clean up resources (worktrees, processes, event listeners)
- **Idempotency**: Operations should be safe to retry

### Performance Considerations
- **Streaming**: Use streaming APIs for CLI output and large data
- **Lazy Loading**: Initialize TUI components only when needed
- **Memory**: Clean up event listeners and intervals in component lifecycle
- **Throttling**: Rate-limit expensive operations like file system scans

### Security Best Practices
- **No Secrets**: Never commit API keys, tokens, or sensitive data
- **Input Validation**: Validate all user input with Zod schemas
- **Command Injection**: Use parameterized arrays for exec commands
- **Path Safety**: Validate and sanitize file paths, prevent directory traversal