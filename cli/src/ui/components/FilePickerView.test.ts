import { expect, test, describe, beforeEach, mock } from "bun:test";

// Mock theme
mock.module("../theme.js", () => ({
  THEME: {
    bg: "#000000",
    dim: "#555555",
    accent: "#00ff00",
    text: "#ffffff",
    white: "#ffffff",
    darkAccent: "#003300",
    highlight: "#00ff00",
  }
}));

describe("FilePickerView", () => {
  let mockRenderer: any;
  let items: string[];
  let events: any;

  beforeEach(() => {
    mockRenderer = {
      requestRender: mock(() => {}),
      keyInput: {
        on: mock(() => {}),
      },
    };
    items = ["file1.ts", "file2.ts", "file3.ts"];
    events = {
      onSelect: mock(() => {}),
      onCancel: mock(() => {}),
    };
  });

  test("should initialize with items", async () => {
    const { FilePickerView } = await import("./FilePickerView.ts");
    const picker = new FilePickerView(mockRenderer, items, events);
    expect((picker as any).items).toEqual(items);
    expect((picker as any).selectedIndex).toBe(0);
  });

  test("should navigate down", async () => {
    const { FilePickerView } = await import("./FilePickerView.ts");
    const picker = new FilePickerView(mockRenderer, items, events);
    (picker as any).navigate(1);
    expect((picker as any).selectedIndex).toBe(1);
    expect(mockRenderer.requestRender).toHaveBeenCalled();
  });

  test("should navigate up", async () => {
    const { FilePickerView } = await import("./FilePickerView.ts");
    const picker = new FilePickerView(mockRenderer, items, events);
    (picker as any).navigate(1); // to 1
    (picker as any).navigate(-1); // back to 0
    expect((picker as any).selectedIndex).toBe(0);
  });

  test("should not navigate out of bounds (wrap around)", async () => {
    const { FilePickerView } = await import("./FilePickerView.ts");
    const picker = new FilePickerView(mockRenderer, items, events);
    // 3 items: indices 0, 1, 2
    // Navigate up from 0 -> should wrap to 2
    (picker as any).navigate(-1);
    expect((picker as any).selectedIndex).toBe(2);
    
    // Navigate down from 2 -> should wrap to 0
    (picker as any).navigate(1);
    expect((picker as any).selectedIndex).toBe(0);
  });

  test("should update items", async () => {
    const { FilePickerView } = await import("./FilePickerView.ts");
    const picker = new FilePickerView(mockRenderer, items, events);
    const newItems = ["a.ts", "b.ts"];
    picker.updateItems(newItems);
    expect((picker as any).items).toEqual(newItems);
    expect((picker as any).selectedIndex).toBe(0);
  });
});
