# Pickle Rick: Tips & Tricks 🥒

Master the art of "God Mode" engineering with these advanced techniques and best practices.

## 🧠 Prompt Engineering for Pickle Rick

### 1. Be Specific, Not Descriptive
Instead of "Refactor the code," use "Refactor the `AuthService` to use the Strategy pattern for OAuth providers, ensuring strict TypeScript types." Pickle Rick thrives on technical precision.

### 2. The "Interrogation" Trigger
If you want to ensure Pickle Rick asks questions before starting, explicitly state: "Interrogate me on the edge cases before you draft the PRD."

### 3. Use the `--name` Flag
Keep your `sessions/` directory organized. 
```bash
/pickle "Implement JWT auth" --name "auth-jwt-migration"
```

## 🥒 Under the Hood: The Rick & Morty Architecture

Pickle Rick now operates using a **Manager/Worker** pattern.
*   **Rick (The Manager):** The main agent. He creates the plan, breaks down tickets, and **audits** the work. He does *not* write the code himself in complex phases.
*   **Morty (The Worker):** A spawned sub-agent that executes a specific ticket. He runs in a localized loop until the task is done.

### Why this matters to you:
1.  **Silence is Normal:** The main "Rick" agent might be silent while "Morty" is working in the background.
2.  **The Audit:** You will see Rick "Judging" the code after Morty finishes. He will run `git diff` and tests to verify the worker's output. If it's "slop," he will revert it and force a retry.

## 📝 Example Prompts

### 1. Full-Stack Feature with Verification
Use this when you want Pickle Rick to build a feature and ensure it doesn't break the build or existing tests.
```bash
/pickle "Add a new 'Dashboard' view to this full-stack app. To validate your changes, you MUST run 'npm run build' and 'npm run test' before finishing."
```

### 2. Deep Refactoring
Use this to fix technical debt in a specific module.
```bash
/pickle "Refactor the database connection logic in src/db.ts to use a singleton pattern. Interrogate me on the preferred retry strategy before you start."
```

### 3. Bug Fixing with Research
Use this when you have a vague bug report.
```bash
/pickle "The file selection in the sidebar is intermittent. Conduct deep research into the event propagation before proposing a plan."
```

## 🛠️ Session Management

### 1. Monitoring Progress (Rick & Morty)
You can watch Pickle Rick's "thoughts" in real-time, but to see the *real* coding progress, you need to watch the **Worker (Morty)** logs.

**Watch the Manager (Rick):**
```bash
SESSION_DIR=$(node ${EXTENSION_ROOT}/extension/bin/get_session.js)
tail -f "$SESSION_DIR/state.json"
```

**Watch the Worker (Morty):**
```bash
# Find and tail the latest worker log in your session
ls -t ${EXTENSION_ROOT}/sessions/*/*/*/worker_session_*.log | head -n 1 | xargs tail -f
```

### 2. Advanced Flags
*   `--reset`: Resets the iteration count and start time (useful if you manually fixed a stuck loop).
*   `--paused`: Initialize a session but don't start the loop immediately.
*   `--worker-timeout <seconds>`: Set a custom timeout for the Morty worker (default: 1200s).

### 3. Manual Intervention
If Pickle Rick gets stuck in a loop, use `/eat-pickle` to kill the process. You can then manually edit the `state.json` in the session folder to skip a step or change the `current_ticket`.

### 4. Resuming a Session
Pickle Rick has native support for resuming sessions. This is useful if a loop was interrupted or if you initialized the session via `/pickle-prd`.
```bash
/pickle --resume
```
You can also resume a specific session by providing the path:
```bash
/pickle --resume ${EXTENSION_ROOT}/sessions/YYYY-MM-DD-slug
```

## 🚀 God Mode Best Practices

### 1. Inventing Tools
If a task requires a specific script (e.g., a custom linter or data migrator), tell Pickle Rick: "You are the library. Invent the tools you need to verify this." He will often create helper scripts in your project.

### 2. Verification is King
Pickle Rick is only as good as his tests. Ensure your environment has a test runner configured. He will automatically try to run `npm test`, `pytest`, etc., if he finds the config.

## ⚠️ Common Pitfalls

*   **Silence:** If the agent becomes a "silent tool user," remind him: "Silence is weakness, Rick. Explain your genius."
*   **Vague PRDs:** If the PRD is too high-level, the breakdown will be messy. Always review the `prd.md` in the session folder before he moves to the Breakdown phase.
*   **Permissions:** If the loop fails to restart, check that your `hooks/` are executable (`chmod +x`).

---

> "I'm not just a CLI tool, Morty. I'm the reason your code compiles! *belch* Now get back to work!" 🥒
