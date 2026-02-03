import { expect, test, describe, mock, beforeEach } from "bun:test";
import { WorkerExecutorClient } from "./worker-client.js";
import type { SessionState } from "../config/types.js";

// Mock global Worker
class MockWorker {
    onmessage: ((event: any) => void) | null = null;
    onerror: ((err: any) => void) | null = null;
    addEventListener = mock((type: string, listener: any) => {
        if (type === "message") this.onmessage = listener;
    });
    removeEventListener = mock(() => {});
    postMessage = mock((msg: any) => {
        if (msg.type === "START") {
            // Simulate worker finishing successfully
            setTimeout(() => {
                this.onmessage!({ data: { type: "PROGRESS", report: { iteration: 1 } } });
                this.onmessage!({ data: { type: "DONE", worktreeInfo: { worktreeDir: "/mock/wt" } } });
            }, 10);
        }
    });
    terminate = mock(() => {});
}

(globalThis as any).Worker = MockWorker;

describe("WorkerExecutorClient", () => {
    let baseState: SessionState;

    beforeEach(() => {
        baseState = {
            active: true,
            working_dir: "/mock/working",
            session_dir: "/mock/session",
            step: "prd",
            iteration: 1,
            max_iterations: 1,
            max_time_minutes: 30,
            start_time_epoch: Date.now(),
            completion_promise: "DONE",
            original_prompt: "Test",
            current_ticket: null,
            history: [],
            started_at: new Date().toISOString()
        };
    });

    test("should run worker and receive DONE", async () => {
        const client = new WorkerExecutorClient();
        const progressReports: any[] = [];
        client.onProgress((p) => progressReports.push(p));

        const result = await client.run(baseState);

        expect(result.worktreeInfo?.worktreeDir).toBe("/mock/wt");
        expect(progressReports.length).toBe(1);
    });

    test("should handle worker errors", async () => {
        const client = new WorkerExecutorClient();
        
        // Override postMessage to simulate error
        const worker = (client as any).worker;
        worker.postMessage = (msg: any) => {
            setTimeout(() => {
                worker.onmessage({ data: { type: "ERROR", message: "Boom" } });
            }, 10);
        };

        expect(client.run(baseState)).rejects.toThrow("Boom");
    });
});
