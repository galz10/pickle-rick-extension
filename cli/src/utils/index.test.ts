import { expect, test, describe } from "bun:test";
import { lerpColor, lerpColorHex, formatDuration, capitalizeProvider, isSessionActive } from "./index.js";
import { RGBA } from "@opentui/core";

describe("index.ts utils", () => {
    describe("lerpColor", () => {
        test("should interpolate between black and white at 0.5", () => {
            const c1 = RGBA.fromValues(0, 0, 0, 1);
            const c2 = RGBA.fromValues(255, 255, 255, 1);
            const mid = lerpColor(c1, c2, 0.5);
            expect(mid.r).toBe(127.5);
            expect(mid.g).toBe(127.5);
            expect(mid.b).toBe(127.5);
            expect(mid.a).toBe(1);
        });

        test("should return start color at t=0", () => {
            const c1 = RGBA.fromValues(10, 20, 30, 1);
            const c2 = RGBA.fromValues(100, 110, 120, 1);
            const res = lerpColor(c1, c2, 0);
            expect(res.r).toBe(10);
        });
    });

    describe("lerpColorHex", () => {
        test("should interpolate hex colors", () => {
            const res = lerpColorHex("#000000", "#FFFFFF", 0.5);
            // #7f7f7f or #808080 depending on rounding in @opentui/core
            expect(res.toLowerCase()).toMatch(/^#7f7f7f|#808080$/);
        });
    });

    describe("formatDuration", () => {
        test("should format milliseconds correctly", () => {
            expect(formatDuration(0)).toBe("00:00s");
            expect(formatDuration(5000)).toBe("00:05s");
            expect(formatDuration(61000)).toBe("01:01s");
            expect(formatDuration(3600000)).toBe("60:00s");
        });
    });

    describe("isSessionActive", () => {
        test("should return true for active statuses", () => {
            expect(isSessionActive("Running")).toBe(true);
            expect(isSessionActive("Starting")).toBe(true);
        });

        test("should return false for terminal statuses", () => {
            expect(isSessionActive("Done")).toBe(false);
            expect(isSessionActive("Cancelled")).toBe(false);
            expect(isSessionActive("Error")).toBe(false);
            expect(isSessionActive("DONE")).toBe(false);
        });
    });

    describe("capitalizeProvider", () => {
        test("should handle special cases", () => {
            expect(capitalizeProvider("opencode")).toBe("OpenCode");
            expect(capitalizeProvider("gemini")).toBe("Gemini CLI");
            expect(capitalizeProvider("codex")).toBe("Codex");
        });

        test("should capitalize unknown providers", () => {
            expect(capitalizeProvider("morty")).toBe("Morty");
            expect(capitalizeProvider("JEz")).toBe("JEz");
        });
    });
});
