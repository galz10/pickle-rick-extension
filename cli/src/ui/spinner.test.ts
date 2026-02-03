import { expect, test, describe, mock, beforeEach, afterEach } from "bun:test";
import { ProgressSpinner } from "./spinner.js";

// Mock logger to avoid side effects during spinner tests
mock.module("./logger.js", () => ({
  logInfo: mock(() => {}),
  logSuccess: mock(() => {}),
  logError: mock(() => {}),
}));

describe("ProgressSpinner", () => {
  const originalWrite = process.stdout.write;
  let capturedOutput = "";

  beforeEach(() => {
    capturedOutput = "";
    // @ts-ignore - mocking stdout.write
    process.stdout.write = mock((str: string | Uint8Array) => {
      capturedOutput += str.toString();
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  test("should initialize with label", () => {
    const spinner = new ProgressSpinner("Loading");
    spinner.updateStep("Step 1");
    expect(capturedOutput).toBe("\rLoading: Step 1");
  });

  test("should initialize with active settings", () => {
    const spinner = new ProgressSpinner("Tasks", ["A", "B"]);
    spinner.updateStep("Running");
    expect(capturedOutput).toBe("\rTasks [A, B]: Running");
  });

  test("success() should clear line and stop", () => {
    const spinner = new ProgressSpinner("Build");
    spinner.updateStep("compiling");
    spinner.success("Done");
    expect(capturedOutput).toContain("\rBuild: compiling");
    expect(capturedOutput).toContain("\n");
  });

  test("error() should clear line and stop", () => {
    const spinner = new ProgressSpinner("Build");
    spinner.updateStep("compiling");
    spinner.error("Fail");
    expect(capturedOutput).toContain("\rBuild: compiling");
    expect(capturedOutput).toContain("\n");
  });

  test("stop() should only write newline if active", () => {
    const spinner = new ProgressSpinner("Idle");
    spinner.stop();
    expect(capturedOutput).toBe("");
    
    spinner.updateStep("Work");
    spinner.stop();
    expect(capturedOutput).toContain("\n");
  });
});
