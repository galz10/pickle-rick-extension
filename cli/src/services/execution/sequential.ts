import type { SessionState } from "../config/types.js";
import { saveState, loadState } from "../config/state.js";
import type { AIProvider } from "../providers/types.js";
import { buildPrompt } from "./prompt.js";
import pc from "picocolors";
import { join, basename } from "node:path";
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execCommand } from "../providers/base.js";
import { getConfiguredModel } from "../providers/index.js";
import { PickleTaskSource } from "./pickle-source.js";
import { createPickleWorktree, cleanupPickleWorktree, createPullRequest, getCurrentBranch, isGhAvailable, generatePRDescription } from "../git/index.js";
import type { Task, WorktreeInfo } from "../../types/tasks.js";
import { createInterface } from "node:readline";

export interface ProgressReport {
    iteration: number;
    taskTitle?: string;
    step?: string;
}

export interface ExecutionResult {
    worktreeInfo?: WorktreeInfo;
}

export type ProgressCallback = (report: ProgressReport) => void;

export type QuestionHandler = (query: string) => Promise<string>;

function askQuestion(query: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

export class SequentialExecutor {
    private progressCallback?: ProgressCallback;
    private currentTaskTitle?: string;
    private questionHandler: QuestionHandler;

    constructor(
        private state: SessionState,
        private provider: AIProvider,
        questionHandler?: QuestionHandler,
        private verbose = false,
        private tuiMode = false
    ) {
        this.questionHandler = questionHandler || askQuestion;
    }

    onProgress(callback: ProgressCallback) {
        this.progressCallback = callback;
        return this;
    }

    private emitProgress(step?: string) {
        if (this.progressCallback) {
            this.progressCallback({
                iteration: this.state.iteration,
                taskTitle: this.currentTaskTitle,
                step
            });
        }
    }

    private async syncFiles(src: string, dest: string, excludes: string[] = []) {
        try {
            // Use rsync for efficiency and exclusion support (standard on macOS/Linux)
            await execCommand("rsync", ["-a", ...excludes.map(e => `--exclude=${e}`), `${src}/`, `${dest}/`], process.cwd());
        } catch (e) {
            // Fallback to cp -R if rsync fails
            try {
                await mkdir(dest, { recursive: true });
                await execCommand("sh", ["-c", `cp -R "${src}/"* "${dest}/"`], process.cwd());
            } catch (cpError) {
                console.error(pc.red(`⚠️ Sync failed: ${cpError}`));
            }
        }
    }

    async run(): Promise<ExecutionResult> {
        this.state.cli_mode = true;
        this.state.active = true;
        await saveState(this.state.session_dir, this.state);

        let executionResult: ExecutionResult = {};

        const taskSource = new PickleTaskSource(this.state.session_dir);
        const logFile = join(this.state.session_dir, "session.log");
        
        const log = async (msg: string) => {
            try { await appendFile(logFile, msg + "\n"); } catch (e) {}
            if (this.verbose) {
                console.log(msg);
            }
        };
        
        const logRaw = async (msg: string) => {
            try { await appendFile(logFile, msg); } catch (e) {}
            if (this.verbose) {
                process.stdout.write(msg);
            }
        };

        const baseBranch = await getCurrentBranch(this.state.working_dir) || "main";
        let sessionWorktree: { worktreeDir: string; branchName: string } | null = null;
        let localSessionDir: string | null = null;
        const sessionName = basename(this.state.session_dir);

        try {
            while (this.state.active) {
                await log(pc.bold(pc.green(`
🥒 Iteration ${this.state.iteration}`)));
                this.emitProgress();

                // Check limits
                if (this.state.max_iterations > 0 && this.state.iteration > this.state.max_iterations) {
                    await log(pc.yellow("Max iterations reached."));
                    this.state.active = false;
                    await saveState(this.state.session_dir, this.state);
                    break;
                }

                // Get Next Task
                const task = await taskSource.getNextTask();
                if (!task) {
                    await log(pc.bold(pc.green("✅ All Tasks Complete!")));
                    this.state.active = false;
                    await saveState(this.state.session_dir, this.state);
                    break;
                }

                this.currentTaskTitle = task.title;
                await log(pc.cyan(`📋 Current Task: ${task.title}`));
                this.emitProgress();

                // Determine Working Context
                let engineWorkDir = this.state.working_dir;
                let engineSessionDir = this.state.session_dir;

                // If it's a TICKET (not a phase), ensure we are in the Session Worktree
                if (task.id.startsWith("phase-") === false) {
                    if (!sessionWorktree) {
                        try {
                            sessionWorktree = await createPickleWorktree(sessionName, baseBranch, this.state.working_dir);
                            await log(pc.dim(`🏗️  Session Worktree: ${sessionWorktree.worktreeDir}`));
                            
                            // Replicate the entire project state to the worktree (including uncommitted files)
                            // We EXCLUDE .git (to keep worktree metadata) and .pickle (to avoid infinite recursion)
                            await log(pc.dim("🔄 Syncing project state to worktree..."));
                            await this.syncFiles(this.state.working_dir, sessionWorktree.worktreeDir, [".git", ".pickle"]);
                            
                            // Clear Gemini session ID when switching execution context
                            this.state.gemini_session_id = undefined;
                            await saveState(this.state.session_dir, this.state);
                        } catch (e) {
                            await log(pc.red(`⚠️ Failed to initialize worktree: ${e}`));
                        }
                    }
                    
                    if (sessionWorktree) {
                        engineWorkDir = sessionWorktree.worktreeDir;
                        
                        // Mirror the Session Directory inside the worktree to bypass sandbox
                        localSessionDir = join(sessionWorktree.worktreeDir, ".pickle", "sessions", sessionName);
                        await mkdir(localSessionDir, { recursive: true });
                        
                        await log(pc.dim("🔄 Syncing session context to worktree..."));
                        await this.syncFiles(this.state.session_dir, localSessionDir);
                        engineSessionDir = localSessionDir;
                    }
                }

                // Build Prompt with local path overrides
                const prompt = await buildPrompt(this.state, task, {
                    sessionDir: engineSessionDir,
                    workingDir: engineWorkDir
                }); 

                // Debug: Save prompt and prepare iteration log
                const debugDir = join(this.state.session_dir, "debug");
                const iterationLogFile = join(debugDir, `iteration_${this.state.iteration}_log.txt`);
                try {
                    await mkdir(debugDir, { recursive: true });
                    await writeFile(
                        join(debugDir, `iteration_${this.state.iteration}_prompt.txt`),
                        prompt,
                        "utf-8"
                    );
                    // Initialize iteration log file
                    await writeFile(iterationLogFile, `=== Iteration ${this.state.iteration} Log ===\nTask: ${task.title}\nStarted: ${new Date().toISOString()}\n\n`, "utf-8");
                } catch (err) {}

                // Helper to log to iteration-specific file
                const logIteration = async (msg: string) => {
                    try { await appendFile(iterationLogFile, msg); } catch (e) {}
                };

                let lastStepLog = "";

                const configuredModel = await getConfiguredModel();
                const modelOverride = configuredModel?.trim()
                    ? configuredModel.trim()
                    : undefined;

                const options = {
                    resumeSessionId: this.state.gemini_session_id,
                    // Ensure engine has access to the local mirrored paths
                    extraIncludes: [engineSessionDir, engineWorkDir],
                } as {
                    resumeSessionId?: string;
                    extraIncludes?: string[];
                    modelOverride?: string;
                };

                if (modelOverride) {
                    options.modelOverride = modelOverride;
                }

                const result = await this.provider.executeStreaming!(
                    prompt,
                    engineWorkDir,
                    async (step, content) => {
                        if (content) {
                            await logRaw(content);
                            await logIteration(content);
                        } else if (step !== "thinking" && step !== lastStepLog) {
                            await log(pc.dim(`Rick is ${step}...`));
                            lastStepLog = step;
                            this.emitProgress(step);
                            const stepMsg = `[STEP] Rick is ${step}...\n`;
                            try { await appendFile(logFile, stepMsg); } catch(e) {}
                            await logIteration(stepMsg);
                        }
                    },
                    options
                );
                
                // Finalize iteration log
                await logIteration(`\n\n=== Iteration ${this.state.iteration} Completed: ${new Date().toISOString()} ===\n`);

                if (!result.success) {
                    const singleLineError = result.error?.replace(/\s+/g, " ").trim();
                    await log(pc.red(`
❌ Engine Error: ${singleLineError}`));
                    try { await appendFile(logFile, `
❌ Engine Error: ${singleLineError}\n`); } catch(e) {}
                    await logIteration(`ERROR: ${singleLineError}\n`);
                    await log(""); // spacing to separate status/info lines visually
                    this.state.active = false;
                    await saveState(this.state.session_dir, this.state);
                    throw new Error(singleLineError || "Engine error");
                }

                if (result.sessionId && !this.state.gemini_session_id) {
                    this.state.gemini_session_id = result.sessionId;
                }

                // Sync Back: If we are in a worktree, sync the local session state back to the master session dir
                if (localSessionDir) {
                    await log(pc.dim("🔄 Syncing changes back to master session..."));
                    await this.syncFiles(localSessionDir, this.state.session_dir);
                }

                // Check for completion
                const promiseFulfilled = this.state.completion_promise && result.response.includes(`<promise>${this.state.completion_promise}</promise>`);
                const explicitDone = result.response.includes("I AM DONE");
                const stopTurn = result.response.includes("[STOP_TURN]");

                if (promiseFulfilled || explicitDone) {
                    await log(pc.bold(pc.green(`
🎯 Task Completed!`)));
                    await taskSource.markComplete(task.id);
                    
                    // Preserve worktree info for TUI review as soon as a task completes
                    if (sessionWorktree) {
                        executionResult.worktreeInfo = {
                            worktreeDir: sessionWorktree.worktreeDir,
                            branchName: sessionWorktree.branchName,
                            baseBranch,
                        };
                        await log(pc.dim("Worktree preserved for TUI review."));
                    }

                    // Check if this was the last ticket (retain existing messaging)
                    const remaining = await taskSource.countRemaining();
                    if (remaining === 0 && sessionWorktree) {
                        await log(pc.bold(pc.green(`
✅ All project tasks complete!`)));

                        // In TUI mode, return worktree info and let the TUI handle the choice
                        if (!this.tuiMode) {
                            // CLI mode: ask user interactively
                            await log(pc.yellow(`
What would you like to do with the changes in '${sessionWorktree.branchName}'?`));
                            await log(pc.dim(`  [m] Merge into '${baseBranch}' locally`));
                            await log(pc.dim(`  [p] Create a Pull Request`));
                            await log(pc.dim(`  [s] Skip (keep worktree for later)`));

                            const answer = await this.questionHandler(pc.yellow(`
Your choice (m/p/s): `));
                            const choice = answer.toLowerCase().trim();

                            if (choice === 'm' || choice === 'merge') {
                                await log(pc.dim("Syncing files from worktree..."));
                                await this.syncFiles(sessionWorktree.worktreeDir, this.state.working_dir, [".git", ".pickle"]);

                                await log(pc.dim("Merging worktree..."));
                                try {
                                    await execCommand("git", ["merge", sessionWorktree.branchName], this.state.working_dir);
                                    await log(pc.green("Merge successful."));
                                } catch (e) {
                                    await log(pc.red(`⚠️ Merge failed: ${e}`));
                                }

                                // Cleanup after merge
                                await log(pc.dim("Deleting worktree..."));
                                try {
                                    await cleanupPickleWorktree(sessionWorktree.worktreeDir, this.state.working_dir);
                                    await log(pc.green("Worktree deleted."));
                                } catch (e) {
                                    await log(pc.red(`⚠️ Cleanup failed: ${e}`));
                                }
                                sessionWorktree = null;
                                localSessionDir = null;
                            } else if (choice === 'p' || choice === 'pr') {
                                // Generate PR description from session artifacts
                                const prDesc = await generatePRDescription(
                                    this.state.session_dir,
                                    sessionWorktree.branchName,
                                    baseBranch
                                );

                                // Check if gh CLI is available
                                const ghAvailable = await isGhAvailable();

                                if (ghAvailable) {
                                    await log(pc.dim("Creating Pull Request..."));
                                    try {
                                        const prUrl = await createPullRequest(
                                            sessionWorktree.branchName,
                                            baseBranch,
                                            prDesc.title,
                                            prDesc.body,
                                            false,
                                            sessionWorktree.worktreeDir
                                        );
                                        if (prUrl) {
                                            await log(pc.green(`✅ Pull Request created: ${prUrl}`));
                                        } else {
                                            await log(pc.red("⚠️ Failed to create PR. Saving description to file..."));
                                            const prDescPath = join(this.state.session_dir, "pr_description.md");
                                            await writeFile(prDescPath, `# ${prDesc.title}\n\n${prDesc.body}`, "utf-8");
                                            await log(pc.yellow(`📄 PR description saved to: ${prDescPath}`));
                                        }
                                    } catch (e) {
                                        await log(pc.red(`⚠️ PR creation failed: ${e}`));
                                        const prDescPath = join(this.state.session_dir, "pr_description.md");
                                        await writeFile(prDescPath, `# ${prDesc.title}\n\n${prDesc.body}`, "utf-8");
                                        await log(pc.yellow(`📄 PR description saved to: ${prDescPath}`));
                                    }
                                } else {
                                    await log(pc.yellow("⚠️ GitHub CLI (gh) not installed or not authenticated."));
                                    await log(pc.dim("Saving PR description to file..."));
                                    const prDescPath = join(this.state.session_dir, "pr_description.md");
                                    await writeFile(prDescPath, `# ${prDesc.title}\n\n${prDesc.body}`, "utf-8");
                                    await log(pc.yellow(`📄 PR description saved to: ${prDescPath}`));
                                    await log(pc.dim(`To create PR manually, push the branch and use:`));
                                    await log(pc.dim(`  git push -u origin ${sessionWorktree.branchName}`));
                                    await log(pc.dim(`  gh pr create --base ${baseBranch} --head ${sessionWorktree.branchName}`));
                                }

                                // Cleanup worktree after PR
                                await log(pc.dim("Deleting worktree..."));
                                try {
                                    await cleanupPickleWorktree(sessionWorktree.worktreeDir, this.state.working_dir);
                                    await log(pc.green("Worktree deleted."));
                                } catch (e) {
                                    await log(pc.red(`⚠️ Cleanup failed: ${e}`));
                                }
                                sessionWorktree = null;
                                localSessionDir = null;
                            } else {
                                await log(pc.dim("Skipping. Worktree preserved at:"));
                                await log(pc.dim(`  ${sessionWorktree.worktreeDir}`));
                            }
                        }
                    }
                } else if (stopTurn) {
                    await log(pc.bold(pc.yellow(`
🛑 Turn Complete (STOP_TURN). Continuing...`)));
                }

                // Reload state from disk (crucial for capturing markComplete updates)
                const freshState = await loadState(this.state.session_dir);
                if (freshState) {
                    const currentSessionId = this.state.gemini_session_id;
                    this.state = freshState;
                    if (!this.state.gemini_session_id && currentSessionId) {
                        this.state.gemini_session_id = currentSessionId;
                    }
                }

                // Increment
                this.state.iteration++;
                await saveState(this.state.session_dir, this.state);
            }
        } catch (fatalError) {
            const msg = fatalError instanceof Error ? fatalError.stack : String(fatalError);
            await log(pc.red(`
💥 FATAL EXCEPTION: ${msg}`));
            throw fatalError;
        }

        return executionResult;
    }
}
