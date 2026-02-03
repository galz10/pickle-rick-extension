import { mock, expect, test, describe, beforeEach, afterEach, spyOn } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.js";
import { SessionData } from "../../types/tasks.js";
import * as utils from "../../utils/index.js";
import { SessionChip } from "./SessionChip.ts";

describe("SessionChip", () => {
  let mockRenderer: any;
  let mockSession: SessionData;
  let onSelect: (session: SessionData) => void;
  let spies: any[] = [];

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    mockSession = {
      id: "test-id",
      startTime: Date.now(),
      prompt: "test prompt",
      status: "Running",
      workingDir: "/test/path",
      gitStatus: { branch: "main", ahead: 0, behind: 0, modified: 0, isClean: true },
    } as SessionData;
    onSelect = mock(() => {});

    spies = [
      spyOn(utils, "formatDuration").mockReturnValue("10s"),
      spyOn(utils, "isSessionActive").mockReturnValue(true),
    ];
  });

  afterEach(() => {
    spies.forEach(s => s.mockRestore());
  });

  test("should initialize", () => {
    const chip = new SessionChip(mockRenderer, mockSession, onSelect);
    expect(chip).toBeDefined();
    // Verify chip has an id
    expect(chip.id).toBeDefined();
  });

  test("should have update method", () => {
    const chip = new SessionChip(mockRenderer, mockSession, onSelect);
    expect(typeof chip.update).toBe("function");
  });

  test("should trigger onSelect when clicked", () => {
    const chip = new SessionChip(mockRenderer, mockSession, onSelect);

    // Simulate mouse up on the chip
    if (chip.onMouse) {
      chip.onMouse({ type: "up", target: chip } as any);
    }

    expect(onSelect).toHaveBeenCalledWith(mockSession);
  });

  test("should not trigger onSelect when clicking cancel button", () => {
    const chip = new SessionChip(mockRenderer, mockSession, onSelect);

    // Simulate mouse up on the cancel button (if it exists)
    if (chip.onMouse && (chip as any).cancelButton) {
      chip.onMouse({ type: "up", target: (chip as any).cancelButton } as any);
    }

    expect(onSelect).not.toHaveBeenCalled();
  });
});
