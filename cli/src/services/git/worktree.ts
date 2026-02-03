import { join } from "node:path";
import { mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import simpleGit, { type SimpleGit } from "simple-git";

export async function createPickleWorktree(
        sessionName: string, 
        baseBranch: string, 
        workingDir: string,
        gitInstance?: SimpleGit
): Promise<{ worktreeDir: string; branchName: string }> {
    const worktreeBase = join(workingDir, ".pickle", "worktrees");
    const worktreeDir = join(worktreeBase, `session-${sessionName}`);
    const branchName = `pickle/session-${sessionName}`;

    if (!existsSync(worktreeBase)) {
        await mkdir(worktreeBase, { recursive: true });
    }

    const git: SimpleGit = gitInstance || simpleGit(workingDir);

    // Check if worktree already exists
    if (existsSync(worktreeDir)) {
        return { worktreeDir, branchName };
    }

    // Prune stale worktrees
    await git.raw(["worktree", "prune"]);

    // Create worktree
    await git.raw(["worktree", "add", "-B", branchName, worktreeDir, baseBranch]);

    return { worktreeDir, branchName };
}

/**
 * Get the git repository root directory
 */
export async function getGitRoot(dir: string, gitInstance?: SimpleGit): Promise<string> {
        const git: SimpleGit = gitInstance || simpleGit(dir);
        try {
                const root = await git.revparse(["--show-toplevel"]);
                return root.trim();
        } catch {
                return dir; // Fallback to provided dir
        }
}

/**
 * Recursively copy files from source to destination, excluding .git and .pickle
 */
async function copyFilesRecursively(
        srcDir: string,
        destDir: string,
        excludeDirs: string[] = [".git", ".pickle"]
): Promise<void> {
        const entries = await readdir(srcDir, { withFileTypes: true });

        for (const entry of entries) {
                if (excludeDirs.includes(entry.name)) continue;

                const srcPath = join(srcDir, entry.name);
                const destPath = join(destDir, entry.name);

                if (entry.isDirectory()) {
                        if (!existsSync(destPath)) {
                                await mkdir(destPath, { recursive: true });
                        }
                        await copyFilesRecursively(srcPath, destPath, excludeDirs);
                } else if (entry.isFile()) {
                        await copyFile(srcPath, destPath);
                }
        }
}

/**
 * Sync changes from worktree back to the original directory
 * This commits any uncommitted changes in the worktree, then merges the branch
 */
export async function syncWorktreeToOriginal(
        worktreeDir: string,
        originalDir: string,
        branchName: string,
        gitInstance?: SimpleGit,
        originalGitInstance?: SimpleGit
): Promise<void> {
        if (!existsSync(worktreeDir)) return;

        // Find the actual git repository root (originalDir might be a subfolder)
        const gitRoot = await getGitRoot(originalDir, originalGitInstance);

        const worktreeGit: SimpleGit = gitInstance || simpleGit(worktreeDir);
        const originalGit: SimpleGit = originalGitInstance || simpleGit(gitRoot);

        // 1. Commit any uncommitted changes in the worktree
        const status = await worktreeGit.status();
        if (status.files.length > 0) {
                // Stage all changes
                await worktreeGit.add("-A");
                // Commit
                await worktreeGit.commit("Auto-commit: Final worktree changes before merge");
        }

        // 2. In the git root directory, merge the worktree branch
        try {
                // First, fetch latest state of the branch (it's local, so this is fast)
                await originalGit.fetch(".", branchName);

                // Merge the branch into current HEAD
                await originalGit.merge([branchName, "--no-ff", "-m", `Merge branch '${branchName}' (Pickle session)`]);
        } catch (error) {
                // If merge fails (conflicts), try copying files directly
                console.error("Merge failed, attempting file copy fallback:", error);

                // Copy files from worktree to git root (excludes .git and .pickle directories)
                await copyFilesRecursively(worktreeDir, gitRoot);
        }
}

/**
 * Cleanup a worktree
 * @param worktreeDir - The worktree directory to remove
 * @param originalDir - The original directory (will find git root automatically)
 */
export async function cleanupPickleWorktree(
        worktreeDir: string,
        originalDir: string,
        gitInstance?: SimpleGit
): Promise<void> {
        if (!existsSync(worktreeDir)) return;

        // Find the actual git repository root
        const gitRoot = await getGitRoot(originalDir, gitInstance);
        const git: SimpleGit = gitInstance || simpleGit(gitRoot);

        try {
                await git.raw(["worktree", "remove", "-f", worktreeDir]);
        } catch (e) {}

        await git.raw(["worktree", "prune"]);
}
