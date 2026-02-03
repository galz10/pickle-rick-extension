import { expect, test, describe, mock } from "bun:test";
import { createProvider, getConfiguredModel } from "./index.js";
import { GeminiProvider } from "./gemini.js";
import { CodexProvider } from "./codex.js";
import { OpencodeProvider } from "./opencode.js";

mock.module("../config/settings.js", () => ({
  getConfiguredProvider: async () => "gemini",
  loadSettings: async () => ({
    model: {
      provider: "gemini",
      model: "gemini-3-flash"
    }
  })
}));

describe("Providers Index", () => {
  test("createProvider should return GeminiProvider for 'gemini' setting", async () => {
    const provider = await createProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe("Gemini CLI");
  });

  test("getConfiguredModel should return model from settings", async () => {
    const model = await getConfiguredModel();
    expect(model).toBe("gemini-3-flash");
  });
});
