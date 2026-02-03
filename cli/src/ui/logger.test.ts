import { mock, expect, test, describe, beforeEach } from "bun:test";

export const mockAppendFile = mock(async () => {});
export const mockMkdir = mock(async () => {});

mock.module("node:fs/promises", () => ({
  appendFile: mockAppendFile,
  mkdir: mockMkdir,
}));

// Force reload of logger
const { logInfo, logSuccess, logError, logWarn, logDebug } = await import("./logger.js?t=" + Date.now());

describe("UI Logger", () => {
  beforeEach(() => {
    mockAppendFile.mockClear();
    mockMkdir.mockClear();
  });

  const waitForAppend = () => new Promise<void>((resolve) => {
    const check = () => {
      if (mockAppendFile.mock.calls.length > 0) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });

  test("logInfo should write [INFO] prefix to log file", async () => {
    logInfo("Test message");
    await waitForAppend();
    
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockAppendFile).toHaveBeenCalled();
    const content = mockAppendFile.mock.calls[0][1];
    expect(content).toContain("[INFO] Test message\n");
  });

  test("logSuccess should write [SUCCESS] prefix", async () => {
    logSuccess("Great success");
    await waitForAppend();
    expect(mockAppendFile).toHaveBeenCalled();
    expect(mockAppendFile.mock.calls[0][1]).toContain("[SUCCESS] Great success\n");
  });

  test("logError should write [ERROR] prefix", async () => {
    logError("Terrible failure");
    await waitForAppend();
    expect(mockAppendFile).toHaveBeenCalled();
    expect(mockAppendFile.mock.calls[0][1]).toContain("[ERROR] Terrible failure\n");
  });

  test("logWarn should write [WARN] prefix", async () => {
    logWarn("Be careful");
    await waitForAppend();
    expect(mockAppendFile).toHaveBeenCalled();
    expect(mockAppendFile.mock.calls[0][1]).toContain("[WARN] Be careful\n");
  });

  test("logDebug should write [DEBUG] prefix", async () => {
    logDebug("Secret stuff");
    await waitForAppend();
    expect(mockAppendFile).toHaveBeenCalled();
    expect(mockAppendFile.mock.calls[0][1]).toContain("[DEBUG] Secret stuff\n");
  });
});
