import { mock, expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import { createMockRenderer } from "../mock-factory.ts";
import * as git from "../../services/git/index.js";
import { DiffViewDialog } from "./DiffViewDialog.ts";

describe("DiffViewDialog", () => {
  let mockRenderer: any;
  let events: any;
  let spies: any[] = [];

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    events = {
      onMerge: mock(async () => {}),
      onCreatePR: mock(async () => {}),
      onReject: mock(async () => {}),
      onClose: mock(() => {}),
    };

    // Use spyOn instead of global mock.module to avoid polluting other tests
    spies = [
      spyOn(git, "getChangedFiles").mockImplementation(async () => [
        { path: "file1.ts", status: "M", additions: 10, deletions: 5 },
      ]),
      spyOn(git, "getFileDiff").mockResolvedValue("diff"),
      spyOn(git, "getStatusIndicator").mockReturnValue("M"),
      spyOn(git, "getStatusColor").mockReturnValue("#ffffff"),
      spyOn(git, "getFileType").mockReturnValue("typescript"),
    ];
  });

  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
  });

  test("should initialize and setup UI", () => {
    const dialog = new DiffViewDialog(mockRenderer, events);
    expect(dialog).toBeDefined();
    expect(dialog.isOpen()).toBe(false);
  });

  test("should show and load changed files", async () => {
    const dialog = new DiffViewDialog(mockRenderer, events);
    
    const mockSession = {
      worktreeInfo: {
        worktreeDir: "/tmp/wt",
        branchName: "feature",
        baseBranch: "main",
      }
    };
    
    await dialog.show(mockSession as any);
    expect(dialog.isOpen()).toBe(true);
    expect(git.getChangedFiles).toHaveBeenCalled();
  });
});
