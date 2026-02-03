import { mock, expect, test, describe, beforeEach } from "bun:test";
import { join } from "node:path";

const mockFiles = new Map<string, string>();

mock.module("node:fs", () => ({
  existsSync: (path: string) => {
    return mockFiles.has(path) || (path.includes(".pickle/sessions") && !path.includes("definitely-not-there"));
  }
}));

mock.module("node:fs/promises", () => ({
  readFile: async (path: string) => {
    if (mockFiles.has(path)) return mockFiles.get(path);
    throw new Error(`File not found: ${path}`);
  },
  writeFile: async (path: string, content: string) => {
    mockFiles.set(path, content);
  },
  mkdir: async () => {},
  readdir: async (path: string) => {
    if (path.includes("sessions")) {
      return [{ name: "session-1", isDirectory: () => true }];
    }
    return [];
  }
}));

mock.module("node:os", () => ({
  homedir: () => "/home/testuser"
}));

mock.module("./settings.js", () => ({
  loadSettings: async () => ({ max_iterations: 15 })
}));

mock.module("../../utils/project-root.js", () => ({
  findProjectRoot: () => "/project"
}));

// Import AFTER mocks
const { getSessionPath, loadState, saveState, createSession } = await import("./state.js");

describe("Config State", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  test("getSessionPath should return correct path", () => {
    expect(getSessionPath("/app", "sid")).toBe(join("/app", ".pickle", "sessions", "sid"));
  });

  test("saveState and loadState should work together", async () => {
    const sessionDir = "/project/.pickle/sessions/test-session";
    const state: any = {
      active: true,
      working_dir: "/project",
      step: "prd",
      iteration: 1,
      max_iterations: 10,
      max_time_minutes: 60,
      worker_timeout_seconds: 1200,
      start_time_epoch: Date.now(),
      completion_promise: "DONE",
      original_prompt: "test prompt",
      current_ticket: "t1",
      history: [],
      started_at: new Date().toISOString(),
      session_dir: sessionDir
    };

    await saveState(sessionDir, state);
    const loaded = await loadState(sessionDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.original_prompt).toBe("test prompt");
  });

  test("loadState should return null if file does not exist", async () => {
    const loaded = await loadState("/definitely-not-there");
    expect(loaded).toBeNull();
  });

  test("createSession should initialize a valid session", async () => {
    const state = await createSession("/project", "new session prompt");
    expect(state.original_prompt).toBe("new session prompt");
    expect(state.working_dir).toBe("/project");
  });
});
