import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { printMinimalPanel } from './pickle_utils.js';
function run_cmd(cmd, options = {}) {
    const { cwd, check = true } = options;
    const command = Array.isArray(cmd) ? cmd.join(' ') : cmd;
    try {
        return execSync(command, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    }
    catch (error) {
        if (check)
            throw new Error(`Command failed: ${command}
Error: ${error.stderr?.toString() || error.message}`);
        return error.stdout?.toString().trim() || '';
    }
}
export function run_git(cmd, cwd, check = true) {
    return run_cmd(['git', ...cmd], { cwd, check });
}
export function get_github_user() {
    try {
        return run_cmd('gh api user -q .login');
    }
    catch {
        try {
            return run_cmd('git config user.name').replace(/\s+/g, '');
        }
        catch {
            return 'pickle-rick';
        }
    }
}
export function get_branch_name(task_id) {
    const user = get_github_user();
    const lowerId = task_id.toLowerCase();
    const type = ["fix", "bug", "patch", "issue"].some(x => lowerId.includes(x)) ? "fix" : "feat";
    return `${user}/${type}/${task_id}`;
}
export function create_worktree(repo_path, base_branch, task_id) {
    const worktree_root = path.join(os.homedir(), ".gemini/extensions/pickle-rick/worktrees");
    if (!fs.existsSync(worktree_root))
        fs.mkdirSync(worktree_root, { recursive: true });
    const worktree_path = path.join(worktree_root, `worktree-${task_id}`);
    const new_branch = get_branch_name(task_id);
    if (fs.existsSync(worktree_path)) {
        printMinimalPanel("Cleanup", { path: worktree_path }, "YELLOW", "🧹");
        try {
            run_git(["worktree", "remove", "--force", worktree_path], undefined, false);
        }
        catch { }
        if (fs.existsSync(worktree_path)) {
            fs.rmSync(worktree_path, { recursive: true, force: true });
            run_git(["worktree", "prune"], undefined, false);
        }
    }
    try {
        run_git(["branch", "-D", new_branch], repo_path, false);
    }
    catch { }
    printMinimalPanel("Creating Worktree", { path: worktree_path, branch: new_branch, base: base_branch }, "GREEN", "🥒");
    run_git(["worktree", "add", "-b", new_branch, worktree_path, base_branch], repo_path);
    return worktree_path;
}
export function remove_worktree(worktree_path) {
    printMinimalPanel("Removing Worktree", { path: worktree_path }, "CYAN", "🗑️");
    try {
        run_git(["worktree", "remove", "--force", worktree_path], undefined, false);
    }
    catch { }
    run_git(["worktree", "prune"], undefined, false);
}
