import {
  BaseProvider,
  checkForErrors,
  execCommand,
  execCommandStreaming,
  parseStreamJsonResult,
  detectStepFromOutput,
} from "./base.js";
import type { AIResult, ProviderOptions } from "./types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink, readFile } from "node:fs/promises";

export class GeminiProvider extends BaseProvider {
  name = "Gemini CLI";
  cliCommand = "gemini";

  async getModelName(): Promise<string | undefined> {
    try {
      const settingsPath = join(homedir(), ".gemini/settings.json");
      const content = await readFile(settingsPath, "utf-8");
      const settings = JSON.parse(content);
      return settings.model?.name;
    } catch (e) {
      return undefined;
    }
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
    // Disable the pickle-rick extension to prevent recursion or interference
    try {
      await execCommand(this.cliCommand, ["extensions", "disable", "pickle-rick"], workDir);
    } catch (e) {
      // Silently ignore if it fails (might not be installed)
    }

    const extensionPath = join(homedir(), ".gemini/extensions/pickle-rick");
    const promptFile = join(workDir, ".gemini-prompt.txt");
    await writeFile(promptFile, prompt, "utf-8");

    const geminiArgs = [
      "-s",
      "-y",
      "-o",
      "stream-json",
      "--include-directories",
      extensionPath,
      "--include-directories",
      join(extensionPath, "sessions"),
      "--include-directories",
      join(extensionPath, "jar"),
      "--include-directories",
      join(extensionPath, "worktrees"),
    ];

    if (options?.resumeSessionId) {
      geminiArgs.push("-r", options.resumeSessionId);
    }

    if (options?.providerArgs) {
      geminiArgs.push(...options.providerArgs);
    }

    if (options?.extraIncludes) {
      for (const include of options.extraIncludes) {
        geminiArgs.push("--include-directories", include);
      }
    }

    const command = "sh";
    const shellArgs = [
      "-c",
      `cat "${promptFile}" | ${this.cliCommand} ${geminiArgs.join(" ")}`,
    ];

    const outputLines: string[] = [];
    let sessionId: string | undefined;

    try {
      const { exitCode } = await execCommandStreaming(
        command,
        shellArgs,
        workDir,
        (line) => {
          outputLines.push(line);
          try {
            const parsed = JSON.parse(line);

            if (parsed.type === "init" && parsed.session_id) {
              sessionId = parsed.session_id;
            }

            if (
              parsed.type === "message" &&
              parsed.role === "assistant" &&
              parsed.content
            ) {
              onProgress("thinking", parsed.content);
            }

            const step = detectStepFromOutput(line);
            if (step) {
              onProgress(step);
            }
          } catch {} // Ignore JSON parsing errors
        },
      );

      const fullOutput = outputLines.join("\n");

      let error = checkForErrors(fullOutput);

      // If exit code is bad but no JSON error found, use the raw output (likely stderr)
      if (exitCode !== 0 && !error) {
        // Filter out likely non-error lines (json) to find the error message
        const rawLines = outputLines.filter((l) => !l.trim().startsWith("{"));
        error =
          rawLines.join("\n") ||
          "Unknown execution error (exit code " + exitCode + ")";
      }

      if (error) {
        return {
          success: false,
          response: "",
          inputTokens: 0,
          outputTokens: 0,
          error,
        };
      }

      const { response, inputTokens, outputTokens } =
        parseStreamJsonResult(fullOutput);

      return {
        success: exitCode === 0 && !error,
        response,
        inputTokens,
        outputTokens,
        error:
          error ||
          (exitCode !== 0 ? "Process exited with code " + exitCode : undefined),
        sessionId,
      };
    } finally {
      try {
        await unlink(promptFile);
      } catch (e) {} // Ignore errors during cleanup

      // Re-enable the extension
      try {
        await execCommand(this.cliCommand, ["extensions", "enable", "pickle-rick"], workDir);
      } catch (e) {} // Ignore errors during cleanup
    }
  }
}