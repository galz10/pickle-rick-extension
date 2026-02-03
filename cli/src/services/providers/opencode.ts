import {
  BaseProvider,
  checkForErrors,
  detectStepFromOutput,
  execCommand,
  execCommandStreaming,
} from "./base.js";
import type { AIResult, ProviderOptions } from "./types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink, readFile } from "node:fs/promises";

interface OpencodeEvent {
  type: string;
  timestamp: number;
  sessionID?: string;
  part?: {
    id?: string;
    sessionID?: string;
    messageID?: string;
    type?: string;
    text?: string;
    tool?: string;
    callID?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: string;
      title?: string;
      metadata?: Record<string, unknown>;
      time?: {
        start?: number;
        end?: number;
      };
    };
    reason?: string;
    snapshot?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache?: {
        read?: number;
        write?: number;
      };
    };
  };
  error?: {
    name?: string;
    data?: {
      message?: string;
      statusCode?: number;
      isRetryable?: boolean;
    };
  };
}



export class OpencodeProvider extends BaseProvider {
  name = "OpenCode";
  cliCommand = "opencode";

  async getModelName(): Promise<string | undefined> {
    // Try JSON config first
    try {
      const configPath = join(homedir(), ".config/opencode/config.json");
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      if (config.model) {
        return config.model;
      }
    } catch {
      // Fall through to try YAML config
    }

    // Try YAML config
    try {
      const yamlConfigPath = join(homedir(), ".opencode/config.yaml");
      const content = await readFile(yamlConfigPath, "utf-8");
      // Simple YAML parsing - look for model: line
      const match = content.match(/^model:\s*(.+)$/m);
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
    const promptFile = join(workDir, ".opencode-prompt.txt");
    await writeFile(promptFile, prompt, "utf-8");

    const opencodeArgs = ["run", "--format", "json"];

    if (options?.resumeSessionId) {
      opencodeArgs.push("-s", options.resumeSessionId);
    }

    if (options?.providerArgs) {
      opencodeArgs.push(...options.providerArgs);
    }

    // Read prompt from stdin
    const command = "sh";
    const shellArgs = [
      "-c",
      `cat "${promptFile}" | ${this.cliCommand} ${opencodeArgs.join(" ")}`,
    ];

    const outputLines: string[] = [];
    let sessionId: string | undefined;
    let accumulatedResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | undefined;

    try {
      const { exitCode } = await execCommandStreaming(
        command,
        shellArgs,
        workDir,
        (line) => {
          outputLines.push(line);
          try {
            const event: OpencodeEvent = JSON.parse(line);

            // Extract session ID from step_start
            if (event.type === "step_start" && event.sessionID) {
              sessionId = event.sessionID;
            }

            // Accumulate text response
            if (event.type === "text" && event.part?.text) {
              accumulatedResponse += event.part.text;
              onProgress("thinking", event.part.text);
            }

            // Detect step from tool_use
            const step = detectStepFromOutput(line);
            if (step) {
              onProgress(step);
            }

            // Extract tokens and cost from step_finish
            if (event.type === "step_finish" && event.part) {
              if (event.part.tokens?.input) {
                inputTokens = event.part.tokens.input;
              }
              if (event.part.tokens?.output) {
                outputTokens = event.part.tokens.output;
              }
              // Check for final completion
              if (event.part.reason === "stop") {
                // Final step
              }
            }

            // Check for errors
            if (event.type === "error" && event.error?.data?.message) {
              error = event.error.data.message;
            }
          } catch {
            // Ignore JSON parsing errors
          }
        },
      );

      // Check for errors in raw output
      const fullOutput = outputLines.join("\n");
      const parsedError = checkForErrors(fullOutput);
      if (parsedError) {
        error = parsedError;
      }

      // If exit code is bad but no error found, use raw output
      if (exitCode !== 0 && !error) {
        const rawLines = outputLines.filter((l) => !l.trim().startsWith("{"));
        error =
          rawLines.join("\n") ||
          `Unknown execution error (exit code ${exitCode})`;
      }

      if (error) {
        return {
          success: false,
          response: accumulatedResponse,
          inputTokens,
          outputTokens,
          error,
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
    } finally {
      // Cleanup
      try {
        await unlink(promptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
