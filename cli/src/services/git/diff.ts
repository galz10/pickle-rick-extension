import simpleGit, { type SimpleGit } from "simple-git";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ChangedFile {
        path: string;
        status: "added" | "modified" | "deleted" | "renamed";
        additions: number;
        deletions: number;
        oldPath?: string; // For renamed files
}

/**
 * Get list of changed files between worktree branch and base branch
 * Includes both committed changes AND uncommitted working tree changes
 */
export async function getChangedFiles(
        worktreeDir: string,
        baseBranch: string,
        gitInstance?: SimpleGit
): Promise<ChangedFile[]> {
        const git: SimpleGit = gitInstance || simpleGit(worktreeDir);
        const filesMap = new Map<string, ChangedFile>();

        try {
                // 1. Get committed changes between base branch and HEAD
                try {
                        const committedDiff = await git.diffSummary([`${baseBranch}...HEAD`]);
                        for (const file of committedDiff.files) {
                                let path = file.file;
                                let oldPath: string | undefined;
                                let status: ChangedFile["status"] = "modified";

                                // Parse renamed files (format: "old => new" or "{old => new}")
                                if (file.file.includes(" => ")) {
                                        status = "renamed";
                                        let match = file.file.match(/(.*?){(.+?)\s*=>\s*(.+?)}(.*)/);
                                        if (match) {
                                                const prefix = match[1] || "";
                                                const suffix = match[4] || "";
                                                oldPath = prefix + match[2] + suffix;
                                                path = prefix + match[3] + suffix;
                                        } else {
                                                match = file.file.match(/(.+?)\s*=>\s*(.+)/);
                                                if (match) {
                                                        oldPath = match[1];
                                                        path = match[2];
                                                }
                                        }
                                }

                                filesMap.set(path, {
                                        path,
                                        oldPath,
                                        status,
                                        additions: "insertions" in file ? file.insertions : 0,
                                        deletions: "deletions" in file ? file.deletions : 0,
                                });
                        }

                        // Get accurate status using --name-status for committed changes
                        const nameStatus = await git.raw(["diff", "--name-status", `${baseBranch}...HEAD`]);
                        for (const line of nameStatus.split("\n").filter(Boolean)) {
                                const [statusStr, ...pathParts] = line.split("\t");
                                const filePath = pathParts.join("\t");
                                const existing = filesMap.get(filePath);
                                if (existing) {
                                        const statusChar = statusStr[0];
                                        if (statusChar === "A") existing.status = "added";
                                        else if (statusChar === "D") existing.status = "deleted";
                                        else if (statusChar === "R") existing.status = "renamed";
                                }
                        }
                } catch {
                        // No committed changes
                }

                // 2. Get uncommitted working tree changes (staged + unstaged)
                try {
                        // Get working tree changes (unstaged)
                        const workingTreeDiff = await git.diffSummary();
                        for (const file of workingTreeDiff.files) {
                                const path = file.file;
                                const existing = filesMap.get(path);
                                if (existing) {
                                        // Add to existing stats
                                        existing.additions += "insertions" in file ? file.insertions : 0;
                                        existing.deletions += "deletions" in file ? file.deletions : 0;
                                } else {
                                        filesMap.set(path, {
                                                path,
                                                status: "modified",
                                                additions: "insertions" in file ? file.insertions : 0,
                                                deletions: "deletions" in file ? file.deletions : 0,
                                        });
                                }
                        }

                        // Get staged changes
                        const stagedDiff = await git.diffSummary(["--staged"]);
                        for (const file of stagedDiff.files) {
                                const path = file.file;
                                const existing = filesMap.get(path);
                                if (existing) {
                                        existing.additions += "insertions" in file ? file.insertions : 0;
                                        existing.deletions += "deletions" in file ? file.deletions : 0;
                                } else {
                                        filesMap.set(path, {
                                                path,
                                                status: "modified",
                                                additions: "insertions" in file ? file.insertions : 0,
                                                deletions: "deletions" in file ? file.deletions : 0,
                                        });
                                }
                        }

                        // Get status for untracked files
                        const status = await git.status();
                        for (const file of status.not_added) {
                                if (!filesMap.has(file)) {
                                        filesMap.set(file, {
                                                path: file,
                                                status: "added",
                                                additions: 0,
                                                deletions: 0,
                                        });
                                }
                        }
                        for (const file of status.created) {
                                const existing = filesMap.get(file);
                                if (existing) {
                                        existing.status = "added";
                                } else {
                                        filesMap.set(file, {
                                                path: file,
                                                status: "added",
                                                additions: 0,
                                                deletions: 0,
                                        });
                                }
                        }
                        for (const file of status.deleted) {
                                const existing = filesMap.get(file);
                                if (existing) {
                                        existing.status = "deleted";
                                } else {
                                        filesMap.set(file, {
                                                path: file,
                                                status: "deleted",
                                                additions: 0,
                                                deletions: 0,
                                        });
                                }
                        }
                } catch {
                        // No working tree changes
                }

                return Array.from(filesMap.values());
        } catch (error) {
                console.error("Error getting changed files:", error);
                return [];
        }
}

/**
 * Get unified diff for a specific file
 * Compares the file against baseBranch, including uncommitted changes
 * For new files, creates a diff showing all lines as additions
 */
export async function getFileDiff(
        worktreeDir: string,
        baseBranch: string,
        filePath: string,
        fileStatus?: "added" | "modified" | "deleted" | "renamed",
        gitInstance?: SimpleGit
): Promise<string> {
        const git: SimpleGit = gitInstance || simpleGit(worktreeDir);

        try {
                // Get diff from baseBranch to current working tree (includes uncommitted changes)
                let diff = await git.diff([baseBranch, "--", filePath]);

                // If diff is empty and file is added/new, create a synthetic diff
                if (!diff && (fileStatus === "added" || !fileStatus)) {
                        // Check if file exists in base branch
                        let existsInBase = true;
                        try {
                                await git.show([`${baseBranch}:${filePath}`]);
                        } catch {
                                existsInBase = false;
                        }

                        // If file doesn't exist in base, it's a new file - read and create diff
                        if (!existsInBase) {
                                try {
                                        const fullPath = join(worktreeDir, filePath);
                                        const content = await readFile(fullPath, "utf-8");
                                        const lines = content.split("\n");
                                        const lineCount = lines.length;

                                        // Create a unified diff format for a new file
                                        diff = `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lineCount} @@
${lines.map(line => `+${line}`).join("\n")}`;
                                } catch (readError) {
                                        console.error(`Error reading new file ${filePath}:`, readError);
                                }
                        }
                }

                return diff;
        } catch (error) {
                console.error(`Error getting diff for ${filePath}:`, error);
                return "";
        }
}

/**
 * Get combined diff for all files
 */
export async function getFullDiff(
        worktreeDir: string,
        baseBranch: string,
        gitInstance?: SimpleGit
): Promise<string> {
        const git: SimpleGit = gitInstance || simpleGit(worktreeDir);

        try {
                const diff = await git.diff([`${baseBranch}...HEAD`]);
                return diff;
        } catch (error) {
                console.error("Error getting full diff:", error);
                return "";
        }
}

/**
 * Get file extension for syntax highlighting
 */
export function getFileType(filePath: string): string {
        const ext = filePath.split(".").pop()?.toLowerCase() || "";

        const extMap: Record<string, string> = {
                ts: "typescript",
                tsx: "typescript",
                js: "javascript",
                jsx: "javascript",
                py: "python",
                rb: "ruby",
                go: "go",
                rs: "rust",
                java: "java",
                kt: "kotlin",
                swift: "swift",
                c: "c",
                cpp: "cpp",
                h: "c",
                hpp: "cpp",
                cs: "csharp",
                php: "php",
                md: "markdown",
                json: "json",
                yaml: "yaml",
                yml: "yaml",
                toml: "toml",
                xml: "xml",
                html: "html",
                css: "css",
                scss: "scss",
                sass: "sass",
                less: "less",
                sql: "sql",
                sh: "bash",
                bash: "bash",
                zsh: "bash",
                fish: "fish",
                ps1: "powershell",
                dockerfile: "dockerfile",
                makefile: "makefile",
        };

        return extMap[ext] || "text";
}

/**
 * Get status indicator character for display
 */
export function getStatusIndicator(status: ChangedFile["status"]): string {
        switch (status) {
                case "added":
                        return "A";
                case "modified":
                        return "M";
                case "deleted":
                        return "D";
                case "renamed":
                        return "R";
                default:
                        return "?";
        }
}

/**
 * Get status color for display
 */
export function getStatusColor(status: ChangedFile["status"]): string {
        switch (status) {
                case "added":
                        return "#4caf50"; // Green
                case "modified":
                        return "#2196f3"; // Blue
                case "deleted":
                        return "#f44336"; // Red
                case "renamed":
                        return "#ff9800"; // Orange
                default:
                        return "#888888";
        }
}
