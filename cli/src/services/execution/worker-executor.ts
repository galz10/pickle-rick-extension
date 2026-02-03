import { SequentialExecutor } from "./sequential.js";
import { createProvider } from "../providers/index.js";
import type { WorkerRequest, WorkerEvent } from "../../types/rpc.js";

declare var self: Worker;

let executor: SequentialExecutor | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data;
    if (msg.type === "START") {
        const provider = await createProvider();

        const questionHandler = (query: string) => {
            self.postMessage({ type: "INPUT_REQUEST", query });
            return new Promise<string>((resolve) => {
                const handler = (e: MessageEvent<WorkerRequest>) => {
                    if (e.data.type === "INPUT_RESPONSE") {
                        self.removeEventListener("message", handler);
                        resolve(e.data.answer);
                    }
                };
                self.addEventListener("message", handler);
            });
        };

        // Pass tuiMode=true to return worktree info instead of asking interactively
        executor = new SequentialExecutor(msg.state, provider, questionHandler, false, true);
        executor.onProgress((report) => self.postMessage({ type: "PROGRESS", report }));

        try {
            const result = await executor.run();
            self.postMessage({ type: "DONE", worktreeInfo: result.worktreeInfo });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            self.postMessage({ type: "ERROR", message });
        }
    } else if (msg.type === "STOP") {
        process.exit(0);
    }
};
