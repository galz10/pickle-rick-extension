import {
  BaseProvider,
  checkForErrors,
  detectStepFromOutput,
  execCommandStreaming,
} from "./base.js";
import type { AIResult, ProviderOptions } from "./types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
}

interface CodexItem {
  id?: string;
  type?: string;
  status?: string;
  text?: string;
  command?: string;
  path?: string;
  paths?: string[];
  files?: string[];
  changes?: Array<{
    path?: string;
  }>;
  tool_name?: string;
  input?: {
    command?: string;
  };
  metadata?: {
    description?: string;
    title?: string;
  };
}

interface CodexEvent {
  type: string;
  thread_id?: string;
  usage?: CodexUsage;
  item?: CodexItem;
  error?: {
    message?: string;
    data?: {
      message?: string;
    };
  };
  message?: string;
}



function extractErrorMessage(event: CodexEvent): string | undefined {
  return (
    event.error?.message ||
    event.error?.data?.message ||
    event.message ||
    undefined
  );
}

export class CodexProvider extends BaseProvider {
  name = "Codex";
  cliCommand = "codex";

  async getModelName(): Promise<string | undefined> {
    try {
      const configPath = join(homedir(), ".codex/config.toml");
      const content = await readFile(configPath, "utf-8");
      const match = content.match(/^model\s*=\s*["']?([^"'\n]+)["']?\s*$/m);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // Config not found or unreadable
    }

    return undefined;
  }

  async execute(
    prompt: string,
    workDir: string,
    options?: ProviderOptions,
  ): Promise<AIResult> {
    return this.executeStreaming(prompt, workDir, () => {}, options);
  }

  async executeStreaming(
    prompt: string,
    workDir: string,
    onProgress: (step: string, content?: string) => void,
    options?: ProviderOptions,
  ): Promise<AIResult> {
    const codexArgs: string[] = ["exec"];

    if (options?.resumeSessionId) {
      codexArgs.push("resume", options.resumeSessionId);
    }

    codexArgs.push("--json");

    if (options?.modelOverride) {
      codexArgs.push("--model", options.modelOverride);
    }

    if (options?.providerArgs) {
      codexArgs.push(...options.providerArgs);
    }

    // Codex CLI currently rejects --add-dir; ignore extraIncludes for this provider to avoid errors

    codexArgs.push("-");

    const outputLines: string[] = [];
    let sessionId: string | undefined;
    let accumulatedResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | undefined;

    const { exitCode } = await execCommandStreaming(
      this.cliCommand,
      codexArgs,
      workDir,
      (line) => {
        outputLines.push(line);
        try {
          const event: CodexEvent = JSON.parse(line);

          if (event.type === "thread.started" && event.thread_id) {
            sessionId = event.thread_id;
          }

          if (event.item) {
            const itemType = event.item.type?.toLowerCase() || "";
            const normalizedItemType = itemType.replace(/[^a-z0-9]/g, "");
            if (
              itemType === "agent_message" ||
              normalizedItemType === "agentmessage"
            ) {
              if (event.item.text) {
              accumulatedResponse += event.item.text;
              onProgress("thinking", event.item.text);
              }
            }

            const step = detectStepFromOutput(line);
            if (step) {
              onProgress(step);
            }
          }

          if (event.usage) {
            if (event.usage.input_tokens !== undefined) {
              inputTokens = event.usage.input_tokens;
            }
            if (event.usage.output_tokens !== undefined) {
              outputTokens = event.usage.output_tokens;
            }
          }

          if (event.type.endsWith(".failed") || event.type === "error") {
            error = error || extractErrorMessage(event) || "Unknown error";
          }
        } catch {
          // Ignore JSON parsing errors
        }
      },
      undefined,
      prompt,
    );

    const fullOutput = outputLines.join("\n");
    const parsedError = checkForErrors(fullOutput);
    if (parsedError) {
      error = parsedError;
    }

    if (exitCode !== 0 && !error) {
      const rawLines = outputLines.filter((l) => !l.trim().startsWith("{"));
      error = rawLines.join("\n") || `Unknown execution error (exit code ${exitCode})`;
    }

    if (error) {
      const compactError = error.replace(/\s+/g, " ").trim();
      return {
        success: false,
        response: accumulatedResponse,
        inputTokens,
        outputTokens,
        error: compactError,
      };
    }

    return {
      success: exitCode === 0 && !error,
      response: accumulatedResponse || "Task completed",
      inputTokens,
      outputTokens,
      error: exitCode !== 0 ? `Process exited with code ${exitCode}` : undefined,
      sessionId,
    };
  }
}
