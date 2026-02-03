import { expect, test, describe, mock } from "bun:test";
import { OpencodeProvider } from "./opencode.js";

// Track which paths should succeed
let shouldJsonSucceed = true;
let shouldYamlSucceed = false;

// Global mock for fs/promises
mock.module("node:fs/promises", () => ({
  readFile: async (path: string) => {
    if (path.includes("/.config/opencode/config.json") && shouldJsonSucceed) {
      return JSON.stringify({
        model: "anthropic/claude-sonnet-4-5"
      });
    }
    if (path.includes("/.opencode/config.yaml") && shouldYamlSucceed) {
      return `model: openai/gpt-4\nother: value`;
    }
    throw new Error("File not found");
  },
  writeFile: async () => {},
  unlink: async () => {}
}));

mock.module("node:os", () => ({
  homedir: () => "/home/testuser"
}));

describe("OpencodeProvider", () => {
  test("should have correct name and cliCommand", () => {
    const provider = new OpencodeProvider();
    expect(provider.name).toBe("OpenCode");
    expect(provider.cliCommand).toBe("opencode");
  });

  test("getModelName should return model from JSON config", async () => {
    shouldJsonSucceed = true;
    shouldYamlSucceed = false;
    const provider = new OpencodeProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBe("anthropic/claude-sonnet-4-5");
  });

  test("getModelName should return model from YAML config if JSON not found", async () => {
    shouldJsonSucceed = false;
    shouldYamlSucceed = true;
    const provider = new OpencodeProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBe("openai/gpt-4");
  });

  test("getModelName should return undefined if no config found", async () => {
    shouldJsonSucceed = false;
    shouldYamlSucceed = false;
    const provider = new OpencodeProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBeUndefined();
  });

  test("isAvailable should check if opencode command exists", async () => {
    const provider = new OpencodeProvider();
    expect(typeof provider.isAvailable).toBe("function");
  });
});
