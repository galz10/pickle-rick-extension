import { expect, test, describe, mock } from "bun:test";
import { GeminiProvider } from "./gemini.js";

// Global mock for fs/promises
mock.module("node:fs/promises", () => ({
  readFile: async (path: string) => {
    if (path.includes("/existent/.gemini/settings.json")) {
      return JSON.stringify({
        model: {
          name: "gemini-3-flash-preview"
        }
      });
    }
    throw new Error("File not found");
  },
  writeFile: async () => {},
  unlink: async () => {}
}));

// Mocking os
let mockHome = "/existent";
mock.module("node:os", () => ({
  homedir: () => mockHome
}));

describe("GeminiProvider", () => {
  test("getModelName should return model name from settings", async () => {
    mockHome = "/existent";
    const provider = new GeminiProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBe("gemini-3-flash-preview");
  });

  test("getModelName should return undefined if file reading fails", async () => {
    mockHome = "/non-existent";
    const provider = new GeminiProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBeUndefined();
  });
});