import { expect, test, describe } from "bun:test";
import { THEME } from "./theme.js";

describe("UI Theme", () => {
  test("THEME should contain all required palette keys", () => {
    const requiredKeys = [
      "bg", "surface", "footer", "text", "dim", "accent", 
      "darkAccent", "blue", "white", "green", "error", 
      "warning", "orange"
    ];
    
    for (const [key, value] of Object.entries(THEME)) {
      expect(requiredKeys).toContain(key);
      expect(typeof value).toBe("string");
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("THEME should have specific high-fidelity colors", () => {
    expect(THEME.bg).toBe("#050f05");
    expect(THEME.accent).toBe("#76ff03");
  });
});
