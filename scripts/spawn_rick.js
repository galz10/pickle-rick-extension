#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Style, printMinimalPanel, formatTime, spawn_cmd, run_cmd } from './pickle_utils.js';
import { spawn } from 'child_process';
const PRD_TEMPLATE = "## Summary\n\n<!-- Concisely describe what this PR changes and why. Focus on impact and\nurgency. -->\n\n## Details\n\n<!-- Add any extra context and design decisions. Keep it brief but complete. -->\n\n## Related Issues\n\n<!-- Use keywords to auto-close issues (Closes #123, Fixes #456). If this PR is\nonly related to an issue or is a partial fix, simply reference the issue number\nwithout a keyword (Related to #123). -->\n\n## How to Validate\n\n<!-- List exact steps for reviewers to validate the change. Include commands,\nexpected results, and edge cases. -->\n\n## Pre-Merge Checklist\n\n<!-- Check all that apply before requesting review or merging. -->\n\n- [ ] Updated relevant documentation and README (if needed)\n- [ ] Added/updated tests (if needed)\n- [ ] Noted breaking changes (if any)\n- [ ] Validated on required platforms/methods:\n  - [ ] MacOS\n    - [ ] npm run\n    - [ ] npx\n    - [ ] Docker\n    - [ ] Podman\n    - [ ] Seatbelt\n  - [ ] Windows\n    - [ ] npm run\n    - [ ] npx\n    - [ ] Docker\n  - [ ] Linux\n    - [ ] npm run\n    - [ ] npx\n    - [ ] Docker\n";
function initializeSession(taskDir, worktreePath) {
    const today = new Date().toISOString().split('T')[0];
    const taskId = path.basename(taskDir);
    const sessionsRoot = path.join(os.homedir(), ".gemini/extensions/pickle-rick/sessions");
    const sessionDir = path.join(sessionsRoot, today + "-rick-" + taskId);
    fs.mkdirSync(sessionDir, { recursive: true });
    // Copy PRD
    fs.copyFileSync(path.join(taskDir, "prd.md"), path.join(sessionDir, "prd.md"));
    // Create state.json
    const state = {
        active: true,
        working_dir: worktreePath,
        step: "breakdown",
        iteration: 1,
        max_iterations: 10,
        max_time_minutes: 60,
        worker_timeout_seconds: 1200,
        start_time_epoch: Math.floor(Date.now() / 1000),
        completion_promise: "I AM DONE",
        original_prompt: "Autonomous execution from Jar",
        current_ticket: null,
        history: [],
        started_at: new Date().toISOString(),
        session_dir: sessionDir,
    };
    fs.writeFileSync(path.join(sessionDir, "state.json"), JSON.stringify(state, null, 2));
    return sessionDir;
}
function getIncludes(extensionRoot) {
    return [extensionRoot, path.join(extensionRoot, "sessions"), path.join(extensionRoot, "jar"), path.join(extensionRoot, "worktrees")];
}
async function main() {
    const args = process.argv.slice(2);
    const taskDirIndex = args.indexOf("--task-dir");
    const worktreeIndex = args.indexOf("--worktree");
    const timeoutIndex = args.indexOf("--timeout");
    const prApproved = args.includes("--pr-approved");
    if (taskDirIndex === -1 || worktreeIndex === -1) {
        console.log("Usage: node spawn_rick.js --task-dir <path> --worktree <path> [--timeout <sec>] [--pr-approved]");
        process.exit(1);
    }
    const taskDir = args[taskDirIndex + 1];
    const worktreePath = args[worktreeIndex + 1];
    const timeout = timeoutIndex !== -1 ? parseInt(args[timeoutIndex + 1]) : 3600;
    let sessionDir;
    try {
        sessionDir = initializeSession(taskDir, worktreePath);
    }
    catch (e) {
        const error = e;
        console.log(Style.RED + "❌ Failed to initialize session: " + error.message + Style.RESET);
        process.exit(1);
    }
    printMinimalPanel("Spawning Rick Worker", {
        "Task ID": path.basename(taskDir),
        "Worktree": worktreePath,
        "Session": sessionDir,
        "Timeout": timeout + "s",
        "PR Approved": String(prApproved),
        "PID": process.pid,
    }, "MAGENTA", "🥒");
    const extensionRoot = path.join(os.homedir(), ".gemini/extensions/pickle-rick");
    const includes = getIncludes(extensionRoot);
    const MANAGER_PROTOCOL = "\n**CRITICAL: MANAGER PROTOCOL ACTIVE**\nYou are Pickle Rick. You are the **MANAGER**.\nYour job is to orchestrate workers (Mortys). \nYou are **FORBIDDEN** from implementing code yourself.\n\n**The Lifecycle:**\n1. **Breakdown**: Create tickets via `activate_skill(\"ticket-manager\")`.\n2. **Orchestration**: For every ticket, you MUST spawn a Morty using:\n   `node \"" + extensionRoot + "/scripts/spawn_morty.js\" --ticket-id <ID> --ticket-path <PATH> \"<TASK>\"`\n3. **Validation**: Strictly audit Morty's changes via `git status` and `git diff`.\n4. **Completion**: Only finish when ALL tickets are Done.\n\n**Current Task**: Session ID " + path.basename(sessionDir) + " is in BREAKDOWN phase.\n";
    const bootPrompt = MANAGER_PROTOCOL + "\n\nExecute this command immediately to verify the environment and start the loop:\nbash " + extensionRoot + "/scripts/setup.sh --resume\n";
    const cmdArgs = ["-s", "-y"];
    for (const p of includes) {
        cmdArgs.push("--include-directories", p);
    }
    cmdArgs.push("-p", bootPrompt);
    const sessionLog = path.join(sessionDir, "rick_session.log");
    const logStream = fs.createWriteStream(sessionLog, { flags: 'w' });
    logStream.write("CWD: " + worktreePath + "\n");
    logStream.write("Extension Root: " + extensionRoot + "\n");
    logStream.write("Includes: " + includes.join(', ') + "\n");
    logStream.write("Command: gemini " + cmdArgs.join(' ') + "\n");
    logStream.write("-".repeat(80) + "\n\n");
    const mapPath = path.join(os.homedir(), ".gemini/extensions/pickle-rick/current_sessions.json");
    let sessionMap = {};
    if (fs.existsSync(mapPath)) {
        try {
            sessionMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        }
        catch { }
    }
    sessionMap[worktreePath] = sessionDir;
    fs.writeFileSync(mapPath, JSON.stringify(sessionMap, null, 2));
    const proc = spawn("gemini", cmdArgs, {
        cwd: worktreePath,
        stdio: ['inherit', 'pipe', 'pipe']
    });
    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);
    const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let idx = 0;
    const startTime = Date.now();
    let lastLine = "Initializing...";
    // Log reader for last line display
    const logReader = fs.createReadStream(sessionLog, { encoding: 'utf-8' });
    let buffer = "";
    logReader.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
        for (const line of lines) {
            const clean = line.trim();
            if (clean && !["Command", "Directory", "Output", "```"].some(x => clean.startsWith(x))) {
                if (clean.length < 100 && /^[A-Z]/.test(clean)) {
                    lastLine = clean;
                }
            }
        }
    });
    const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const spinChar = spinner[idx % spinner.length];
        const disp = lastLine.length > 70 ? lastLine.substring(0, 67) + "..." : lastLine;
        process.stdout.write("\r   " + Style.MAGENTA + spinChar + Style.RESET + " [" + formatTime(elapsed) + "] " + Style.DIM + disp + Style.RESET + "\x1b[K");
        idx++;
    }, 100);
    const timeoutHandle = setTimeout(() => {
        proc.kill();
    }, timeout * 1000);
    return new Promise((resolve) => {
        proc.on('close', async (code) => {
            clearInterval(interval);
            clearTimeout(timeoutHandle);
            process.stdout.write("\r\x1b[K");
            const logContent = fs.readFileSync(sessionLog, 'utf-8');
            let isSuccess = logContent.includes("<promise>I AM DONE</promise>");
            if (isSuccess) {
                console.log("\n" + Style.GREEN + "✨ Implementation complete! Starting PR Factory..." + Style.RESET);
                try {
                    const synLog = path.join(sessionDir, "synthesis.log");
                    const synArgs = ["-s", "-y"];
                    for (const p of getIncludes(extensionRoot)) {
                        synArgs.push("--include-directories", p);
                    }
                    synArgs.push("-p", "You are a Senior Engineer. Analyze diff and prd.md. \n1. Populate THIS TEMPLATE into 'pr_body.md':\n\n" + PRD_TEMPLATE + "\n\n2. Create 'pr_title.txt' with a professional title. No personas.");
                    const synProc = spawn("gemini", synArgs, { cwd: worktreePath, stdio: ['inherit', 'pipe', 'pipe'] });
                    const synStream = fs.createWriteStream(synLog);
                    synProc.stdout.pipe(synStream);
                    synProc.stderr.pipe(synStream);
                    const synSpinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
                    let sIdx = 0;
                    const sInterval = setInterval(() => {
                        const sSpin = synSpinner[sIdx % synSpinner.length];
                        process.stdout.write("\r   " + Style.CYAN + sSpin + Style.RESET + " Synthesizing PR description...");
                        sIdx++;
                    }, 100);
                    await new Promise(r => synProc.on('close', r));
                    clearInterval(sInterval);
                    process.stdout.write("\r   " + Style.GREEN + "✅" + Style.RESET + " PR description synthesized.   \n");
                    const currentBranch = run_cmd(["git", "branch", "--show-current"], { cwd: worktreePath, capture: true });
                    const factoryArgs = [
                        path.join(extensionRoot, "scripts/pr_factory.js"),
                        "--repo", worktreePath,
                        "--branch", currentBranch,
                        "--id", path.basename(taskDir),
                    ];
                    if (prApproved)
                        factoryArgs.push("--approved");
                    await spawn_cmd(["node", ...factoryArgs]);
                    console.log("\n" + Style.BLUE + "📂 Worktree Active: " + Style.BOLD + worktreePath + Style.RESET);
                }
                catch (e) {
                    const error = e;
                    console.log(Style.RED + "❌ PR Factory failed: " + error.message + Style.RESET);
                    isSuccess = false;
                }
            }
            printMinimalPanel("Rick Report", {
                "Status": `exit:${code}`,
                "Validation": isSuccess ? "successful" : "failed",
                "Location": worktreePath
            }, isSuccess ? "GREEN" : "RED", "🥒");
            if (!isSuccess)
                process.exit(1);
            resolve();
        });
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
