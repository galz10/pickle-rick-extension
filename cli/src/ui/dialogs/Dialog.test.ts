import { mock, expect, test, describe, beforeEach } from "bun:test";
import { createMockRenderer, type MockRenderer } from "./test-utils.ts";
import type { CliRenderer } from "@opentui/core";

mock.module("../theme.js", () => ({
  THEME: {
    bg: "#000000",
    dim: "#555555",
    accent: "#00ff00",
    darkAccent: "#003300",
    text: "#ffffff",
    white: "#ffffff",
  }
}));

describe("Dialog", () => {
  let mockRenderer: MockRenderer;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should initialize with title", async () => {
    const { Dialog } = await import("./Dialog.ts");
    const dialog = new Dialog(mockRenderer as unknown as CliRenderer, "Test Title");
    expect(dialog).toBeDefined();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.root).toBeDefined();
  });

  test("should show and hide", async () => {
    const { Dialog } = await import("./Dialog.ts");
    const dialog = new Dialog(mockRenderer as unknown as CliRenderer, "Test Title");

    dialog.show();
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.root.visible).toBe(true);

    dialog.hide();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.root.visible).toBe(false);
  });

  test("should have setOptions method", async () => {
    const { Dialog } = await import("./Dialog.ts");
    const dialog = new Dialog(mockRenderer as unknown as CliRenderer, "Test Title");

    expect(typeof dialog.setOptions).toBe("function");
  });
});
