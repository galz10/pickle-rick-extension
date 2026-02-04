#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { run_cmd, Style, printBanner, spawn_cmd } from './pickle_utils.js';
async function main() {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith("--date="))?.split("=")[1] || new Date().toISOString().split('T')[0];
    const prApproved = args.includes("--pr-approved");
    const jarRoot = path.join(os.homedir(), ".gemini/extensions/pickle-rick/jar");
    const dateDir = path.join(jarRoot, dateArg);
    if (!fs.existsSync(dateDir)) {
        console.log(`${Style.YELLOW}⚠️ No jar found for date: ${dateArg}${Style.RESET}`);
        process.exit(0);
    }
    const tasks = fs.readdirSync(dateDir).filter(d => fs.statSync(path.join(dateDir, d)).isDirectory()).sort();
    if (tasks.length === 0) {
        console.log(`${Style.YELLOW}⚠️ No tasks in the jar for date: ${dateArg}${Style.RESET}`);
        process.exit(0);
    }
    printBanner(`Pickle Jar Crunch: Processing tasks for ${dateArg}`);
    const extensionRoot = path.join(os.homedir(), ".gemini/extensions/pickle-rick");
    const scriptsDir = path.join(extensionRoot, "scripts");
    for (let i = 0; i < tasks.length; i++) {
        const taskId = tasks[i];
        const taskDir = path.join(dateDir, taskId);
        const metaPath = path.join(taskDir, "meta.json");
        if (!fs.existsSync(metaPath)) {
            console.log(`${Style.RED}❌ Skipping ${taskId}: meta.json missing${Style.RESET}`);
            continue;
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (!["queued", "marinating"].includes(meta.status)) {
            console.log(`${Style.DIM}⏭️  Skipping ${taskId}: status is '${meta.status}'${Style.RESET}`);
            continue;
        }
        const repoPath = meta.repo_path;
        const baseBranch = meta.branch;
        console.log(`${Style.BOLD}[${i + 1}/${tasks.length}] Crunching Task: ${taskId}${Style.RESET}`);
        console.log(`  Repo: ${repoPath}`);
        console.log(`  Base Branch: ${baseBranch}`);
        let worktreePath = "";
        try {
            // 1. Create Worktree
            console.log(`  Creating worktree...`);
            // Call the JS version of git_utils
            const res = run_cmd(["node", path.join(scriptsDir, "git_utils.js"), "add", "--repo", repoPath, "--branch", baseBranch, "--id", taskId], { capture: true });
            // Extract path from output "Successfully created worktree: <path>" or similar
            // Assuming git_utils.ts output matches
            worktreePath = res.split(": ").pop() || "";
            // 2. Spawn Rick
            console.log(`  Starting Rick Worker...`);
            const rickCmd = ["node", path.join(scriptsDir, "spawn_rick.js"), "--task-dir", taskDir, "--worktree", worktreePath];
            if (prApproved) {
                rickCmd.push("--pr-approved");
            }
            await spawn_cmd(rickCmd);
            console.log(`${Style.GREEN}✅ Task ${taskId} Crunched!${Style.RESET}`);
        }
        catch (err) {
            const error = err;
            console.log(`${Style.RED}❌ Task ${taskId} failed: ${error.message}${Style.RESET}`);
            const handoffPath = path.join(taskDir, "handoff.md");
            fs.writeFileSync(handoffPath, `# Handoff: Task ${taskId}

Task failed during execution.
Error: ${error.message}
`);
        }
        finally {
            if (worktreePath && prApproved) {
                console.log(`  Cleaning up worktree...`);
                run_cmd(["node", path.join(scriptsDir, "git_utils.js"), "remove", "--path", worktreePath], { check: false });
            }
            else if (worktreePath) {
                console.log(`${Style.YELLOW}⚠️  Worktree kept for review: ${worktreePath}${Style.RESET}`);
            }
        }
        console.log("-".repeat(60));
    }
    printBanner("Crunch complete. Wubba Lubba Dub Dub!");
    // Signal completion
    try {
        const getSessionScript = path.join(scriptsDir, "get_session.sh");
        if (fs.existsSync(getSessionScript)) {
            const sessionDir = run_cmd(["bash", getSessionScript], { capture: true, check: false });
            if (sessionDir) {
                const statePath = path.join(sessionDir, "state.json");
                if (fs.existsSync(statePath)) {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                    state.jar_complete = true;
                    state.active = false;
                    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
                    console.log(`${Style.DIM}Signal: Jar Complete. Session deactivated.${Style.RESET}`);
                }
            }
        }
    }
    catch (e) {
        const error = e;
        console.log(`${Style.DIM}Warning: Could not signal session completion: ${error.message}${Style.RESET}`);
    }
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
