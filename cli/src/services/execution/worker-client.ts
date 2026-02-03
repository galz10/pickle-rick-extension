import type { SessionState } from "../config/types.js";
import type { WorkerRequest, WorkerEvent } from "../../types/rpc.js";
import type { ProgressCallback, QuestionHandler, ExecutionResult } from "./sequential.js";

export class WorkerExecutorClient {
    private worker: Worker;
    private progressCallback?: ProgressCallback;
    private inputHandler?: QuestionHandler;

    constructor() {
        let workerPath: string;

        // Try to resolve relative to the current file (works in dev)
        try {
            workerPath = new URL("./worker-executor.ts", import.meta.url).href;

            // If we are in a compiled bundle, import.meta.url might be a bunfs: path
            // and the worker-executor.js should be next to the executable.
            if (workerPath.startsWith("bunfs:") || !import.meta.url.endsWith(".ts")) {
                const processPath = process.execPath;
                // Simple string manipulation to find dirname since we can't await path.dirname
                const lastSlash = processPath.lastIndexOf("/");
                const dirname = lastSlash !== -1 ? processPath.substring(0, lastSlash) : ".";
                workerPath = `${dirname}/worker-executor.js`;
            }
        } catch (e) {
            // Fallback for extreme cases
            workerPath = "./worker-executor.js";
        }

        try {
            this.worker = new Worker(workerPath, {
                env: process.env as Record<string, string>
            });
        } catch (e) {
            console.error("[WorkerClient] Failed to spawn worker at " + workerPath, e);
            throw e;
        }

        this.worker.onerror = (err) => {
            console.error("[WorkerClient] Worker Error:", err);
        };
    }

    onProgress(cb: ProgressCallback) {
        this.progressCallback = cb;
        return this;
    }

    onInput(handler: QuestionHandler) {
        this.inputHandler = handler;
        return this;
    }

    async run(state: SessionState): Promise<ExecutionResult> {
        // console.log("[WorkerClient] Sending START request to worker...");
        return new Promise((resolve, reject) => {
            const messageHandler = async (event: MessageEvent<WorkerEvent>) => {
                const msg = event.data;
                // console.log("[WorkerClient] Received message from worker:", msg.type);
                if (!msg || typeof msg !== "object") return;

                switch (msg.type) {
                    case "PROGRESS":
                        this.progressCallback?.(msg.report);
                        break;
                    case "DONE":
                        this.worker.removeEventListener("message", messageHandler);
                        resolve({ worktreeInfo: msg.worktreeInfo });
                        break;
                    case "ERROR":
                        this.worker.removeEventListener("message", messageHandler);
                        reject(new Error(msg.message));
                        break;
                    case "INPUT_REQUEST":
                        if (this.inputHandler) {
                            const answer = await this.inputHandler(msg.query);
                            this.worker.postMessage({ type: "INPUT_RESPONSE", answer });
                        } else {
                            this.worker.postMessage({ type: "INPUT_RESPONSE", answer: "n" });
                        }
                        break;
                }
            };
            this.worker.addEventListener("message", messageHandler);
            this.worker.postMessage({ type: "START", state });
        });
    }

    stop() {
        this.worker.postMessage({ type: "STOP" });
        this.worker.terminate();
    }
}
