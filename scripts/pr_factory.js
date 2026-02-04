#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { run_cmd, Style } from './pickle_utils.js';
export async function createPr(repoPath, branch, taskId, approved = false) {
    // 1. Prepare Content
    const bodyFile = path.join(repoPath, "pr_body.md");
    if (!fs.existsSync(bodyFile)) {
        console.log("Warning: pr_body.md not found. Creating a generic body.");
        fs.writeFileSync(bodyFile, `Autonomous implementation of task ${taskId}.
`);
    }
    const titleFile = path.join(repoPath, "pr_title.txt");
    let title = `feat: Autonomous task ${taskId}`;
    if (fs.existsSync(titleFile)) {
        title = fs.readFileSync(titleFile, 'utf-8').trim();
    }
    // 2. Logic Split
    if (!approved) {
        console.log(`${Style.YELLOW}⚠️  PR Creation NOT Approved (--pr-approved missing).${Style.RESET}`);
        console.log(`Drafting PR content to local files only.`);
        let prdPath = path.join(repoPath, "PRD.md");
        if (!fs.existsSync(prdPath))
            prdPath = path.join(repoPath, "prd.md");
        const bodyContent = fs.readFileSync(bodyFile, 'utf-8');
        if (fs.existsSync(prdPath)) {
            fs.appendFileSync(prdPath, `

# Generated Pull Request

`);
            fs.appendFileSync(prdPath, `**Title:** ${title}

`);
            fs.appendFileSync(prdPath, `**Branch:** ${branch}

`);
            fs.appendFileSync(prdPath, bodyContent);
            console.log(`${Style.GREEN}✅ PR Draft appended to ${prdPath}${Style.RESET}`);
        }
        else {
            console.log(`${Style.RED}❌ PRD file not found. Could not append draft.${Style.RESET}`);
        }
        console.log(`Worktree is kept alive at: ${repoPath}`);
        return;
    }
    // 3. Push & Publish (Approved Mode)
    const remotes = run_cmd(["git", "remote"], { cwd: repoPath, capture: true });
    if (!remotes) {
        throw new Error("No git remotes found. Cannot push or create PR.");
    }
    const remote = remotes.includes("origin") ? "origin" : remotes.split("\n")[0];
    console.log(`Pushing branch ${branch} to ${remote}...`);
    run_cmd(["git", "push", "-u", remote, branch], { cwd: repoPath });
    console.log(`Creating Pull Request: ${title}...`);
    // Use shlex-like quoting or just pass as array to run_cmd which handles it
    run_cmd([
        "gh", "pr", "create",
        "--title", `"${title.replace(/"/g, '\\"')}"`,
        "--body-file", `"${bodyFile.replace(/"/g, '\\"')}"`
    ], { cwd: repoPath });
}
// CLI Support
if (import.meta.url.endsWith(path.basename(process.argv[1]) || '')) {
    const args = process.argv.slice(2);
    const repoIndex = args.indexOf("--repo");
    const branchIndex = args.indexOf("--branch");
    const idIndex = args.indexOf("--id");
    const approved = args.includes("--approved");
    if (repoIndex === -1 || branchIndex === -1 || idIndex === -1) {
        console.log("Usage: node pr_factory.js --repo <path> --branch <name> --id <id> [--approved]");
        process.exit(1);
    }
    const repoPath = args[repoIndex + 1];
    const branch = args[branchIndex + 1];
    const taskId = args[idIndex + 1];
    createPr(repoPath, branch, taskId, approved).catch(err => {
        console.error(`${Style.RED}PR Creation Failed: ${err.message}${Style.RESET}`);
        process.exit(1);
    });
}
