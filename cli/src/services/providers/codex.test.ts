import { expect, test, describe, mock } from "bun:test";
import { CodexProvider } from "./codex.js";

let shouldConfigSucceed = true;

mock.module("node:fs/promises", () => ({
  readFile: async (path: string) => {
    if (path.includes("/.codex/config.toml") && shouldConfigSucceed) {
      return 'model = "gpt-5.2"';
    }
    throw new Error("File not found");
  },
}));

mock.module("node:os", () => ({
  homedir: () => "/home/testuser",
}));

describe("CodexProvider", () => {
  test("should have correct name and cliCommand", () => {
    const provider = new CodexProvider();
    expect(provider.name).toBe("Codex");
    expect(provider.cliCommand).toBe("codex");
  });

  test("getModelName should return model from config", async () => {
    shouldConfigSucceed = true;
    const provider = new CodexProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBe("gpt-5.2");
  });

  test("getModelName should return undefined if config missing", async () => {
    shouldConfigSucceed = false;
    const provider = new CodexProvider();
    const modelName = await provider.getModelName();
    expect(modelName).toBeUndefined();
  });
});
