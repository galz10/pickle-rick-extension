export interface Task {
    id: string;
    title: string;
    body?: string;
    completed: boolean;
    metadata?: Record<string, any>;
}

export interface TaskSource {
    getNextTask(): Promise<Task | null>;
    markComplete(id: string): Promise<void>;
    countRemaining(): Promise<number>;
    getTask(id: string): Promise<Task | null>;
}

/**
 * Worktree information for completed sessions
 */
export interface WorktreeInfo {
  worktreeDir: string;
  branchName: string;
  baseBranch: string;
}

/**
 * Git status information for session display
 */
export interface GitStatusInfo {
  branch: string;
  ahead: number;
  behind: number;
  modified: number;
  isClean: boolean;
}

/**
 * Metadata for a running Pickle session
 */
export interface SessionData {
  id: string;
  prompt: string;
  engine: string;
  status: string;
  startTime: number; // epoch
  isPrdMode?: boolean;
  worktreeInfo?: WorktreeInfo;
  gitStatus?: GitStatusInfo;
  workingDir?: string; // path to display (shortened)
  iteration?: number;
}
