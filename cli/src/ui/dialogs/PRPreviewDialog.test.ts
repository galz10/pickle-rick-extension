import { mock, expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import { createMockRenderer } from "../mock-factory.ts";
import * as git from "../../services/git/index.js";
import { PRPreviewDialog } from "./PRPreviewDialog.ts";

describe("PRPreviewDialog", () => {
  let mockRenderer: any;
  let events: any;
  let spies: any[] = [];

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    events = {
      onConfirm: mock(async () => {}),
      onCancel: mock(() => {}),
    };

    // Use spyOn instead of global mock.module to avoid polluting other tests
    spies = [
      spyOn(git, "generatePRDescription").mockResolvedValue({ title: "Test Title", body: "Test Body" }),
    ];
  });

  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
  });

  test("should initialize and setup UI", () => {
    const dialog = new PRPreviewDialog(mockRenderer, events);
    expect(dialog).toBeDefined();
    expect(dialog.isOpen()).toBe(false);
  });

  test("should show and load PR description", async () => {
    const dialog = new PRPreviewDialog(mockRenderer, events);
    
    const mockSession = {
      id: "test-session",
      worktreeInfo: {
        branchName: "feature",
        baseBranch: "main",
      }
    };
    
    await dialog.show(mockSession as any);
    expect(dialog.isOpen()).toBe(true);
    // titleInput.value should be set to the title from generatePRDescription
    expect((dialog as any).titleInput.value).toBe("Test Title");
  });
});
