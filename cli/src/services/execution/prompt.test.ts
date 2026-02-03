import { expect, test, describe, mock, beforeEach } from "bun:test";
import { buildPrompt } from "./prompt.js";
import type { SessionState } from "../config/types.js";
import type { Task } from "../../types/tasks.js";

// Mock utilities
mock.module("../../utils/resources.js", () => ({
    resolveSkillPath: (name: string) => `/mock/skills/${name}.md`,
    getExtensionRoot: () => "/mock/extension",
    getCliCommand: () => "pickle"
}));

mock.module("../../utils/persona.js", () => ({
    PICKLE_PERSONA: "I AM PICKLE RICK"
}));

// Mock fs/promises and fs
const mockFiles: Record<string, string> = {
    "/mock/skills/prd-drafter.md": "PRD Skill content",
    "/mock/skills/ticket-manager.md": "Ticket Skill content",
    "/mock/skills/code-researcher.md": "Research Skill content",
    "/mock/session/ticket1/linear_ticket_ticket1.md": "status: Triage\ntitle: Ticket 1",
};

const mockExists: Record<string, boolean> = {
    "/mock/skills/prd-drafter.md": true,
    "/mock/skills/ticket-manager.md": true,
    "/mock/skills/code-researcher.md": true,
    "/mock/session/ticket1/linear_ticket_ticket1.md": true,
};

mock.module("node:fs/promises", () => ({
    readFile: async (path: string) => {
        if (mockFiles[path]) return mockFiles[path];
        throw new Error(`File not found: ${path}`);
    }
}));

mock.module("node:fs", () => ({
    existsSync: (path: string) => !!mockExists[path],
    readdirSync: (path: string) => []
}));

describe("Prompt Logic (buildPrompt)", () => {
    const baseState: SessionState = {
        active: true,
        working_dir: "/mock/working",
        session_dir: "/mock/session",
        step: "prd",
        iteration: 1,
        max_iterations: 10,
        max_time_minutes: 30,
        start_time_epoch: Date.now(),
        completion_promise: "DONE",
        original_prompt: "Test prompt",
        current_ticket: null,
        history: [],
        started_at: new Date().toISOString()
    };

    test("should generate PRD phase prompt", async () => {
        const task: Task = { id: "phase-prd", title: "PRD", body: "", completed: false };
        const prompt = await buildPrompt(baseState, task);
        
        expect(prompt).toContain("Phase: REQUIREMENTS");
        expect(prompt).toContain("PRD Skill content");
        expect(prompt).toContain("I AM PICKLE RICK");
    });

    test("should generate Breakdown phase prompt", async () => {
        const task: Task = { id: "phase-breakdown", title: "Breakdown", body: "", completed: false };
        const prompt = await buildPrompt(baseState, task);
        
        expect(prompt).toContain("Phase: BREAKDOWN");
        expect(prompt).toContain("Ticket Skill content");
    });

    test("should generate Research phase prompt for a new ticket", async () => {
        const task: Task = { id: "ticket1", title: "Ticket 1", body: "", completed: false };
        const prompt = await buildPrompt(baseState, task);
        
        expect(prompt).toContain("Phase: RESEARCH (Ticket: Ticket 1)");
        expect(prompt).toContain("Research Skill content");
        expect(prompt).toContain("linear_ticket_ticket1.md");
    });

    test("should fail if ticket file is missing", async () => {
        const task: Task = { id: "missing", title: "Missing", body: "", completed: false };
        
        expect(buildPrompt(baseState, task)).rejects.toThrow("CRITICAL ERROR: Ticket file missing");
    });
});
