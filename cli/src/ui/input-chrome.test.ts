import { expect, test, describe, mock } from "bun:test";
import { buildVerticalBar, createCtrlCExitHandler } from "./input-chrome.js";
import { THEME } from "./theme.js";
import type { CliRenderer, TextRenderable, KeyEvent } from "@opentui/core";

describe("Input Chrome Utilities", () => {
  describe("buildVerticalBar", () => {
    test("should build a bar of correct height", () => {
      expect(buildVerticalBar(1)).toBe("┃");
      expect(buildVerticalBar(3)).toBe("┃\n┃\n┃");
      expect(buildVerticalBar(0)).toBe("");
    });

    test("should handle undefined or percentage as default height 5", () => {
      const expected = "┃\n┃\n┃\n┃\n┃";
      expect(buildVerticalBar(undefined)).toBe(expected);
      expect(buildVerticalBar("100%")).toBe(expected);
    });
  });

  describe("createCtrlCExitHandler", () => {
    test("should show hint on first Ctrl+C and exit on second", () => {
      const mockRenderer = {
        destroy: mock(() => {}),
        requestRender: mock(() => {}),
      } as unknown as CliRenderer;

      const mockHintText = {
        content: "",
        fg: "",
      } as unknown as TextRenderable;
      
      const originalExit = process.exit;
      Object.defineProperty(process, 'exit', {
        value: mock(() => {}),
        configurable: true
      });

      const handler = createCtrlCExitHandler({
        renderer: mockRenderer,
        hintText: mockHintText,
        originalContent: "Original",
      });

      // First Ctrl+C
      const handled1 = handler({ ctrl: true, name: "c" } as KeyEvent);
      expect(handled1).toBe(true);
      expect(mockHintText.content).toBe("Press Ctrl+C again to exit");
      expect(mockHintText.fg).toBe(THEME.warning);
      expect(mockRenderer.requestRender).toHaveBeenCalled();
      expect(mockRenderer.destroy).not.toHaveBeenCalled();

      // Second Ctrl+C (immediate)
      const handled2 = handler({ ctrl: true, name: "c" } as KeyEvent);
      expect(handled2).toBe(true);
      expect(mockRenderer.destroy).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);

      Object.defineProperty(process, 'exit', { value: originalExit });
    });
  });
});
