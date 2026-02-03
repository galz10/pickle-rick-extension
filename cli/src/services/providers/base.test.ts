import { expect, test, describe } from "bun:test";
import { parseStreamJsonResult, checkForErrors, detectStepFromOutput, commandExists, execCommand } from "./base.js";

describe("Providers Base Utils", () => {
  describe("parseStreamJsonResult", () => {
    test("should extract response and tokens from message and result types", () => {
      const output = [
        JSON.stringify({ type: "message", role: "assistant", content: "Hello " }),
        JSON.stringify({ type: "message", role: "assistant", content: "World" }),
        JSON.stringify({ type: "result", usage: { input_tokens: 10, output_tokens: 20 } })
      ].join("\n");

      const result = parseStreamJsonResult(output);
      expect(result.response).toBe("Hello World");
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);
    });

    test("should handle missing tokens gracefully", () => {
      const output = JSON.stringify({ type: "message", role: "assistant", content: "Hello" });
      const result = parseStreamJsonResult(output);
      expect(result.response).toBe("Hello");
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });
  });

  describe("checkForErrors", () => {
    test("should return error message if error type found", () => {
      const output = JSON.stringify({ type: "error", error: { message: "Something went wrong" } });
      const error = checkForErrors(output);
      expect(error).toBe("Something went wrong");
    });

    test("should return null if no errors", () => {
      const output = JSON.stringify({ type: "message", content: "OK" });
      const error = checkForErrors(output);
      expect(error).toBeNull();
    });
  });

  describe("detectStepFromOutput", () => {
    test("should detect read operations", () => {
      const output = JSON.stringify({ tool: "read", file_path: "/path/to/file.ts" });
      expect(detectStepFromOutput(output)).toBe("Reading code");
    });

    test("should detect write operations", () => {
      const output = JSON.stringify({ tool: "write", file_path: "/path/to/file.ts" });
      expect(detectStepFromOutput(output)).toBe("Implementing");
    });

    test("should detect testing", () => {
      const output = JSON.stringify({ command: "bun test" });
      expect(detectStepFromOutput(output)).toBe("Testing");
    });

    test("should detect committing", () => {
      const output = JSON.stringify({ command: "git commit -m 'test'" });
      expect(detectStepFromOutput(output)).toBe("Committing");
    });

    test("should return null for non-JSON", () => {
      expect(detectStepFromOutput("not json")).toBeNull();
    });
  });

  // These tests use actual Bun.spawn since we're running in Bun
  // Note: commandExists uses 'which' command which may behave differently
  describe("commandExists", () => {
    test("should return false for non-existing command", async () => {
      const exists = await commandExists("nonexistent_command_xyz_12345");
      expect(exists).toBe(false);
    });
  });

  describe("execCommand", () => {
    test("should return result object with expected properties", async () => {
      const result = await execCommand("echo", ["hello"], ".");
      expect(result).toBeDefined();
      expect("stdout" in result).toBe(true);
      expect("stderr" in result).toBe(true);
      expect("exitCode" in result).toBe(true);
    });
  });
});
