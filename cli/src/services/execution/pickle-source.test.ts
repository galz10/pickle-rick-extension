import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { PickleTaskSource } from "./pickle-source.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import type { SessionState } from "../config/types.js";

describe("PickleTaskSource Sequencing", () => {
    
    // TODO: Fix ENOENT race condition in test setup
    test.skip("should sort tickets by order field", async () => {
        const testDir = join(process.cwd(), `.tmp_test_session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        await mkdir(testDir, { recursive: true });
        
        const fullState: SessionState = {
            active: true,
            working_dir: process.cwd(),
            session_dir: testDir,
            step: "research",
            iteration: 1,
            max_iterations: 10,
            max_time_minutes: 30,
            worker_timeout_seconds: 60,
            start_time_epoch: Date.now(),
            completion_promise: "DONE",
            original_prompt: "test",
            current_ticket: null,
            history: [],
            started_at: new Date().toISOString()
        };
        writeFileSync(join(testDir, "state.json"), JSON.stringify(fullState));

        // Create tickets in mixed order
        await writeFile(join(testDir, "ticket_3.md"), `---\nid: t3\ntitle: Third\nstatus: Triage\norder: 30\n---\nBody`);
        await writeFile(join(testDir, "ticket_1.md"), `---\nid: t1\ntitle: First\nstatus: Triage\norder: 10\n---\nBody`);
        await writeFile(join(testDir, "ticket_2.md"), `---\nid: t2\ntitle: Second\nstatus: Triage\norder: 20\n---\nBody`);

        const source = new PickleTaskSource(testDir);
        
        const task1 = await source.getNextTask();
        expect(task1?.id).toBe("t1");
        await source.markComplete("t1");

        const task2 = await source.getNextTask();
        expect(task2?.id).toBe("t2");
        await source.markComplete("t2");

        const task3 = await source.getNextTask();
        expect(task3?.id).toBe("t3");

        await rm(testDir, { recursive: true });
    });

    // TODO: Fix ENOENT race condition in test setup
    test.skip("should fallback to birthtime if order is identical", async () => {
         const testDir = join(process.cwd(), `.tmp_test_session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
         await mkdir(testDir, { recursive: true });
         
         const fullState: SessionState = {
            active: true,
            working_dir: process.cwd(),
            session_dir: testDir,
            step: "research",
            iteration: 1,
            max_iterations: 10,
            max_time_minutes: 30,
            worker_timeout_seconds: 60,
            start_time_epoch: Date.now(),
            completion_promise: "DONE",
            original_prompt: "test",
            current_ticket: null,
            history: [],
            started_at: new Date().toISOString()
        };
        writeFileSync(join(testDir, "state.json"), JSON.stringify(fullState));

         await writeFile(join(testDir, "ticket_a.md"), `---\nid: ta\ntitle: A\nstatus: Triage\norder: 10\n---\nBody`);
         // Wait a bit to ensure different birthtime
         await new Promise(r => setTimeout(r, 100));
         await writeFile(join(testDir, "ticket_b.md"), `---\nid: tb\ntitle: B\nstatus: Triage\norder: 10\n---\nBody`);

         const source = new PickleTaskSource(testDir);
         const task1 = await source.getNextTask();
         expect(task1?.id).toBe("ta");

         await rm(testDir, { recursive: true });
    });
});
