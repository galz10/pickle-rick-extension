import { expect, test, describe, mock } from "bun:test";
import { loadSettings, saveSettings, getConfiguredProvider, getConfiguredModel, updateModelSettings } from "./settings.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";

// Mock fs/promises
mock.module("node:fs/promises", () => ({
  readFile: async (path: string) => {
    if (path.includes("/.pickle/settings.json")) {
      return JSON.stringify({
        model: {
          provider: "gemini",
          model: "gemini-3-flash"
        }
      });
    }
    throw new Error("File not found");
  },
  writeFile: async () => {},
  mkdir: async () => {}
}));

mock.module("node:os", () => ({
  homedir: () => "/home/testuser"
}));

describe("Settings", () => {
  test("loadSettings should parse settings.json", async () => {
    const settings = await loadSettings();
    expect(settings.model?.provider).toBe("gemini");
    expect(settings.model?.model).toBe("gemini-3-flash");
  });

  test("getConfiguredProvider should return provider from settings", async () => {
    const provider = await getConfiguredProvider();
    expect(provider).toBe("gemini");
  });

  test("getConfiguredModel should return model from settings", async () => {
    const model = await getConfiguredModel();
    expect(model).toBe("gemini-3-flash");
  });
});
