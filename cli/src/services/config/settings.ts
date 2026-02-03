import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { PickleSettings, PickleSettingsSchema } from "./types.js";
import type { AIProviderName } from "../providers/types.js";

const SETTINGS_DIR = join(homedir(), ".pickle");
const SETTINGS_PATH = join(SETTINGS_DIR, "settings.json");

// Valid provider names
const VALID_PROVIDERS = [
  "gemini", "opencode", "claude", "cursor", "codex", 
  "qwen", "droid", "copilot"
] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixed?: string; // Fixed JSON string if applicable
}

/**
 * Attempt to fix common JSON syntax errors
 */
function fixJsonSyntax(jsonString: string): string | null {
  // Remove trailing commas before } or ]
  let fixed = jsonString.replace(/,(\s*[}\]])/g, '$1');
  
  // Try to parse the fixed JSON
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Validate settings file content
 */
export function validateSettings(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if content is empty
  if (!content || content.trim() === "") {
    return { valid: false, errors: ["Settings file is empty"], warnings };
  }
  
  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    // Try to fix common syntax errors
    const fixed = fixJsonSyntax(content);
    if (fixed) {
      try {
        parsed = JSON.parse(fixed);
        warnings.push("Fixed trailing comma in JSON");
      } catch {
        errors.push(`Invalid JSON syntax: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        return { valid: false, errors, warnings, fixed: undefined };
      }
    } else {
      errors.push(`Invalid JSON syntax: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      return { valid: false, errors, warnings, fixed: undefined };
    }
  }
  
  // Keep track if we fixed the JSON
  const wasFixed = parsed !== undefined && content !== JSON.stringify(parsed);
  
  // Validate against schema
  const schemaResult = PickleSettingsSchema.safeParse(parsed);
  if (!schemaResult.success) {
    schemaResult.error.errors.forEach((err) => {
      errors.push(`Schema error at ${err.path.join('.')}: ${err.message}`);
    });
    return { valid: false, errors, warnings, fixed: wasFixed ? JSON.stringify(parsed) : undefined };
  }
  
  const settings = schemaResult.data;
  
  // Validate provider if specified
  if (settings.model?.provider) {
    if (!VALID_PROVIDERS.includes(settings.model.provider as typeof VALID_PROVIDERS[number])) {
      errors.push(
        `Invalid provider "${settings.model.provider}". ` +
        `Must be one of: ${VALID_PROVIDERS.join(", ")}`
      );
    }
  }
  
  // Validate model string if specified
  if (settings.model?.model !== undefined) {
    if (typeof settings.model.model !== "string") {
      errors.push("Model must be a string");
    } else if (settings.model.model.trim() === "") {
      warnings.push("Model name is empty - provider default will be used");
    }
  }
  
  // Warn if no provider configured
  if (!settings.model?.provider) {
    warnings.push("No provider configured - will use default (Gemini)");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixed: wasFixed ? JSON.stringify(parsed, null, 2) : undefined
  };
}

/**
 * Validate and load settings with detailed error reporting
 */
export async function loadSettingsWithValidation(): Promise<{ settings: PickleSettings; validation: ValidationResult }> {
  try {
    const content = await readFile(SETTINGS_PATH, "utf-8");
    const validation = validateSettings(content);
    
    // If we have a fixed version, use it
    const parsed = validation.fixed 
      ? JSON.parse(validation.fixed)
      : JSON.parse(content);
    
    const settings = PickleSettingsSchema.parse(parsed);
    return { settings, validation };
  } catch (e) {
    // File doesn't exist or is completely unreadable
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        settings: {},
        validation: {
          valid: true,
          errors: [],
          warnings: ["Settings file does not exist - using defaults"]
        }
      };
    }
    
    return {
      settings: {},
      validation: {
        valid: false,
        errors: [`Failed to load settings: ${e instanceof Error ? e.message : String(e)}`],
        warnings: []
      }
    };
  }
}

/**
 * Load settings from ~/.pickle/settings.json
 * Returns default settings if file doesn't exist or is invalid
 */
export async function loadSettings(): Promise<PickleSettings> {
  try {
    const content = await readFile(SETTINGS_PATH, "utf-8");
    const json = JSON.parse(content);
    return PickleSettingsSchema.parse(json);
  } catch (e) {
    // Return empty/default settings if file doesn't exist or is invalid
    return {};
  }
}

/**
 * Save settings to ~/.pickle/settings.json
 * Creates the directory if it doesn't exist
 */
export async function saveSettings(settings: PickleSettings): Promise<void> {
  try {
    await mkdir(SETTINGS_DIR, { recursive: true });
    const validated = PickleSettingsSchema.parse(settings);
    await writeFile(SETTINGS_PATH, JSON.stringify(validated, null, 2), "utf-8");
  } catch (e) {
    throw new Error(`Failed to save settings: ${e}`);
  }
}

/**
 * Get the configured provider name from settings
 * Returns undefined if not configured
 */
export async function getConfiguredProvider(): Promise<string | undefined> {
  const settings = await loadSettings();
  return settings.model?.provider;
}

/**
 * Get the configured model name from settings
 * Returns undefined if not configured
 */
export async function getConfiguredModel(): Promise<string | undefined> {
  const settings = await loadSettings();
  return settings.model?.model;
}

/**
 * Update specific model settings
 */
export async function updateModelSettings(
  provider?: AIProviderName,
  model?: string
): Promise<void> {
  const settings = await loadSettings();
  const newSettings: PickleSettings = {
    ...settings,
    model: {
      provider,
      model,
    },
  };
  await saveSettings(newSettings);
}
