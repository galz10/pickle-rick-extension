import { expect, test, describe, mock, beforeEach } from "bun:test";
import { createMockRenderer } from "./mock-factory.ts";
import type { InputRenderable, BoxRenderable } from "@opentui/core";
import type { FilePickerState } from "./file-picker-utils.js";

// Mock search utility
const mockRecursiveSearch = mock(async () => ({ files: ["test.ts", "other.ts"] }));
mock.module("../utils/search.js", () => ({
  recursiveSearch: mockRecursiveSearch,
}));

// Now import the target
import { setupFilePicker } from "./file-picker-utils.js";

describe("File Picker Utils", () => {
  let mockRenderer: any;
  let mockInput: InputRenderable;
  let mockContainer: BoxRenderable;
  let state: FilePickerState;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    
    mockInput = {
      value: "",
      syntaxStyle: null,
      removeHighlightsByRef: mock(() => {}),
      addHighlightByCharRange: mock(() => {}),
      focus: mock(() => {}),
      on: mock(() => {}),
      deleteCharBackward: mock(() => false),
    } as any;
    
    mockContainer = {
      add: mock(() => {}),
      remove: mock(() => {}),
    } as any;
    
    state = {
      activePicker: null,
    };
  });

  test("setupFilePicker should register syntax highlighting and override delete", () => {
    const cleanup = setupFilePicker(mockRenderer, mockInput, mockContainer, state);
    expect(mockInput.syntaxStyle).not.toBeNull();
    expect(typeof mockInput.deleteCharBackward).toBe("function");
    cleanup();
  });

  test("should trigger search when @ is typed", async () => {
    setupFilePicker(mockRenderer, mockInput, mockContainer, state);
    
    // @ts-ignore - accessing mock properties
    const inputCalls = mockInput.on.mock.calls;
    const onInput = inputCalls.find((c: [string, Function]) => c[0] === "input")[1];
    
    await onInput("Checking @");
    expect(mockRecursiveSearch).toHaveBeenCalled();
  });

  test("atomic deletion logic", () => {
    setupFilePicker(mockRenderer, mockInput, mockContainer, state);
    
    mockInput.value = "File is @test.ts";
    // Should delete @test.ts atomically
    const deleted = mockInput.deleteCharBackward();
    expect(deleted).toBe(true);
    expect(mockInput.value).toBe("File is ");
  });
});
