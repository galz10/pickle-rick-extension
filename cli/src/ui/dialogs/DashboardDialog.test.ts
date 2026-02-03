import { mock, expect, test, describe, beforeEach, afterEach } from "bun:test";
import { createMockRenderer, createMockSession, type MockRenderer, type MockSelect } from "./test-utils.ts";
import type { CliRenderer } from "@opentui/core";

mock.module("../theme.js", () => ({
  THEME: {
    bg: "#000000",
    dim: "#555555",
    accent: "#00ff00",
    darkAccent: "#003300",
    text: "#ffffff",
    white: "#ffffff",
    surface: "#111111",
    green: "#00ff00",
  }
}));

const mockLogView = {
  root: { id: "mock-log-view-root", add: mock(() => {}) },
  destroy: mock(() => {}),
};

mock.module("../views/LogView.js", () => ({
  LogView: class {
    constructor() { return mockLogView; }
  }
}));

const utilsMock = {
  formatDuration: mock((ms: number) => "10s"),
  Clipboard: { copy: mock(async () => {}) },
};
mock.module("../../utils/index.js", () => utilsMock);

const fsMock = {
  readFile: mock(async () => "mock log content"),
};
mock.module("node:fs/promises", () => fsMock);

interface MockInterval {
  fn: Function;
  ms: number;
}

describe("DashboardDialog", () => {
  let mockRenderer: MockRenderer;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let intervals: MockInterval[] = [];

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    intervals = [];
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    
    // @ts-ignore - Mocking global timer functions
    global.setInterval = mock((fn: Function, ms: number) => {
      const id = { fn, ms };
      intervals.push(id);
      return id as unknown as Timer;
    });
    
    // @ts-ignore - Mocking global timer functions
    global.clearInterval = mock((id: Timer) => {
      intervals = intervals.filter(i => (i as unknown as Timer) !== id);
    });
  });

  afterEach(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });

  test("should initialize and setup UI", async () => {
    const { DashboardDialog } = await import("./DashboardDialog.ts");
    const dashboard = new DashboardDialog(mockRenderer as unknown as CliRenderer);
    expect(dashboard).toBeDefined();
    expect(dashboard.isOpen()).toBe(false);
  });

  test("should update with session data", async () => {
    const { DashboardDialog } = await import("./DashboardDialog.ts");
    const dashboard = new DashboardDialog(mockRenderer as unknown as CliRenderer);
    
    const mockSession = createMockSession({
      id: "sessions/test-id",
      prompt: "test prompt",
      startTime: Date.now() - 10000,
      status: "Running",
      engine: "gemini",
      isPrdMode: false,
    });
    
    dashboard.update(mockSession);
    
    expect(global.setInterval).toHaveBeenCalled();
    expect(mockRenderer.requestRender).toHaveBeenCalled();
  });

  test("should clear ticker on hide", async () => {
    const { DashboardDialog } = await import("./DashboardDialog.ts");
    const dashboard = new DashboardDialog(mockRenderer as unknown as CliRenderer);
    
    const mockSession = createMockSession({
      id: "sessions/test-id",
      prompt: "test prompt",
      startTime: Date.now(),
      status: "Running",
    });
    
    dashboard.update(mockSession);
    expect(intervals.length).toBe(1);
    
    dashboard.hide();
    expect(global.clearInterval).toHaveBeenCalled();
    expect(intervals.length).toBe(0);
  });

  test("should handle copy logs to clipboard", async () => {
    const { DashboardDialog } = await import("./DashboardDialog.ts");
    const dashboard = new DashboardDialog(mockRenderer as unknown as CliRenderer);
    
    const mockSession = createMockSession({
      id: "sessions/test-id",
      prompt: "test prompt",
      startTime: Date.now(),
      status: "Running",
    });
    
    dashboard.update(mockSession);
    
    const internalDialog = (dashboard as any).dialog as MockSelect;
    const copyOption = internalDialog.options.find((o) => o.title === "Copy");
    expect(copyOption).toBeDefined();
    
    // We need to cast copyOption to include onSelect which is not in MockSelect options but is in the real DialogOption
    interface DialogOptionWithSelect {
      onSelect: (dialog: any) => Promise<void>;
    }
    
    await (copyOption as unknown as DialogOptionWithSelect).onSelect(internalDialog);
    expect(fsMock.readFile).toHaveBeenCalled();
    expect(utilsMock.Clipboard.copy).toHaveBeenCalledWith("mock log content");
  });
});
