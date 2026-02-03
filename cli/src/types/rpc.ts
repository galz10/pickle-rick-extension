import type { SessionState } from "../services/config/types.js";
import type { ProgressReport } from "../services/execution/sequential.js";
import type { WorktreeInfo } from "./tasks.js";

export type WorkerRequest =
    | { type: "START", state: SessionState }
    | { type: "STOP" }
    | { type: "INPUT_RESPONSE", answer: string };

export type WorkerEvent =
    | { type: "PROGRESS", report: ProgressReport }
    | { type: "INPUT_REQUEST", query: string }
    | { type: "DONE", worktreeInfo?: WorktreeInfo }
    | { type: "ERROR", message: string };
