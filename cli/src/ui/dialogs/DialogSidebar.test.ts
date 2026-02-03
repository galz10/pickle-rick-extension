import { mock, expect, test, describe, beforeEach } from "bun:test";
import { createOpentuiMocks, createMockRenderer, createMockSession, type MockRenderer } from "./test-utils.ts";
import type { CliRenderer } from "@opentui/core";


// Mock Sidebar and DashboardDialog
const mockSidebar = {
  update: mock(() => {}),
  show: mock(() => {}),
  hide: mock(() => {}),
  isOpen: mock(() => false),
  root: { visible: false, right: -45, add: mock(() => {}) },
  showInput: mock(() => {}),
  hideInput: mock(() => {}),
  focusInput: mock(() => {}),
};

const mockDashboardDialog = {
  update: mock(() => {}),
  show: mock(() => {}),
  hide: mock(() => {}),
  isOpen: mock(() => false),
  root: { visible: false, add: mock(() => {}) },
  destroy: mock(() => {}),
};

mock.module("./Sidebar.js", () => ({
  Sidebar: class {
    constructor() { return mockSidebar; }
  }
}));

mock.module("./DashboardDialog.js", () => ({
  DashboardDialog: class {
    constructor() { return mockDashboardDialog; }
  }
}));

describe("DialogSidebar", () => {
  let mockRenderer: MockRenderer;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    mockSidebar.isOpen.mockReturnValue(false);
    mockDashboardDialog.isOpen.mockReturnValue(false);
    // Clear mocks
    mockSidebar.update.mockClear();
    mockSidebar.show.mockClear();
    mockSidebar.hide.mockClear();
    mockSidebar.showInput.mockClear();
    mockDashboardDialog.update.mockClear();
    mockDashboardDialog.show.mockClear();
    mockDashboardDialog.hide.mockClear();
  });

  test("should delegate to Sidebar by default", async () => {
    const { DialogSidebar } = await import("./DialogSidebar.ts");
    const ds = new DialogSidebar(mockRenderer as unknown as CliRenderer);
    
    const mockSession = createMockSession({ id: "test" });
    ds.update(mockSession);
    
    expect(mockSidebar.update).toHaveBeenCalledWith(mockSession, false);
    expect(mockDashboardDialog.update).not.toHaveBeenCalled();
  });

  test("should delegate to DashboardDialog when useDialog is true", async () => {
    const { DialogSidebar } = await import("./DialogSidebar.ts");
    const ds = new DialogSidebar(mockRenderer as unknown as CliRenderer);
    ds.setUseDialog(true);
    
    const mockSession = createMockSession({ id: "test" });
    ds.update(mockSession);
    
    expect(mockDashboardDialog.update).toHaveBeenCalledWith(mockSession);
    expect(mockSidebar.update).not.toHaveBeenCalled();
  });

  test("should handle show/hide for both modes", async () => {
    const { DialogSidebar } = await import("./DialogSidebar.ts");
    const ds = new DialogSidebar(mockRenderer as unknown as CliRenderer);
    
    ds.show();
    expect(mockSidebar.root.visible).toBe(true);
    
    ds.setUseDialog(true);
    ds.show();
    expect(mockDashboardDialog.show).toHaveBeenCalled();
    
    ds.hide();
    expect(mockDashboardDialog.hide).toHaveBeenCalled();
  });

  test("should check isOpen for both modes", async () => {
    const { DialogSidebar } = await import("./DialogSidebar.ts");
    const ds = new DialogSidebar(mockRenderer as unknown as CliRenderer);
    
    mockSidebar.isOpen.mockReturnValue(true);
    expect(ds.isOpen()).toBe(true);
    
    ds.setUseDialog(true);
    mockDashboardDialog.isOpen.mockReturnValue(true);
    expect(ds.isOpen()).toBe(true);
  });
});
