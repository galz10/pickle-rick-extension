export * from "./types.js";
export * from "./base.js";
export * from "./codex.js";
export * from "./gemini.js";
export * from "./opencode.js";

import { CodexProvider } from "./codex.js";
import { GeminiProvider } from "./gemini.js";
import { OpencodeProvider } from "./opencode.js";
import type { AIProvider, AIProviderName } from "./types.js";
import { loadSettings, getConfiguredProvider } from "../config/settings.js";

/**
 * Create a provider instance based on settings or default to Gemini
 */
export async function createProvider(): Promise<AIProvider> {
  const configuredProvider = await getConfiguredProvider();
  
  switch (configuredProvider) {
    case "codex":
      return new CodexProvider();
    case "opencode":
      return new OpencodeProvider();
    case "gemini":
    default:
      return new GeminiProvider();
  }
}

/**
 * Get the currently configured provider name
 */
export { getConfiguredProvider };

/**
 * Get the currently configured model name from settings
 */
export async function getConfiguredModel(): Promise<string | undefined> {
  const settings = await loadSettings();
  return settings.model?.model;
}
