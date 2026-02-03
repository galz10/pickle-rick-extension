import { expect, test, describe, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { SequentialExecutor } from "./sequential.js";
import type { SessionState } from "../config/types.js";
import type { Task } from "../../types/tasks.js";
import type { AIProvider } from "../providers/types.js";
import * as state from "../config/state.js";
import * as git from "../git/index.js";
import * as prompt from "./prompt.js";
import * as providers from "../providers/index.js";
import { PickleTaskSource } from "./pickle-source.js";

describe("SequentialExecutor", () => {
    let baseState: SessionState;
    let mockProvider: AIProvider;
    let currentState: SessionState;
    let spies: any[] = [];

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
        currentState = baseState;

        mockProvider = {
            executeStreaming: async (p: string, workDir: string, onChunk: any, options: any) => {
                onChunk("thinking", "");
                onChunk("done", "I AM DONE");
                return { success: true, response: "I AM DONE", sessionId: "session-123" };
            }
        } as unknown as AIProvider;

        // Use spyOn instead of mock.module to avoid leakage
        spies = [
            spyOn(state, "saveState").mockImplementation(async (dir, s) => { currentState = s; }),
            spyOn(state, "loadState").mockImplementation(async (dir) => currentState),
            spyOn(git, "getCurrentBranch").mockResolvedValue("main"),
            spyOn(git, "createPickleWorktree").mockResolvedValue({ worktreeDir: "/mock/worktree", branchName: "session-branch" }),
            spyOn(git, "cleanupPickleWorktree").mockResolvedValue(undefined),
            spyOn(git, "isGhAvailable").mockResolvedValue(false),
            spyOn(git, "generatePRDescription").mockResolvedValue({ title: "PR", body: "Body" }),
            spyOn(prompt, "buildPrompt").mockResolvedValue("Mocked Prompt"),
            spyOn(providers, "getConfiguredModel").mockResolvedValue("mock-model"),
            // Mock the PickleTaskSource methods
            spyOn(PickleTaskSource.prototype, "getNextTask").mockImplementation(async function(this: any) {
                if (!this._mockTasks) {
                    this._mockTasks = [{ id: "task1", title: "Task 1", body: "", completed: false }];
                }
                return this._mockTasks.shift() || null;
            }),
            spyOn(PickleTaskSource.prototype, "markComplete").mockResolvedValue(undefined),
            spyOn(PickleTaskSource.prototype, "countRemaining").mockResolvedValue(0),
        ];
    });

    afterEach(() => {
        spies.forEach(spy => spy.mockRestore());
    });

    test("should execute a task successfully", async () => {
        const executor = new SequentialExecutor(baseState, mockProvider, async () => "s", false, true);
        const result = await executor.run();
        
        expect(result.worktreeInfo?.worktreeDir).toBe("/mock/worktree");
        expect(baseState.iteration).toBe(2);
        expect(baseState.active).toBe(false);
    });

    test("should stop when max iterations reached", async () => {
        baseState.iteration = 2;
        baseState.max_iterations = 1;
        
        const executor = new SequentialExecutor(baseState, mockProvider, async () => "s", false, true);
        const result = await executor.run();
        
        expect(baseState.active).toBe(false);
        expect(baseState.iteration).toBe(2);
    });
});
