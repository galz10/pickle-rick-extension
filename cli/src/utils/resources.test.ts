import { expect, test, describe, mock, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import * as resources from "./resources.js";

// Note: We can't mock homedir() for module-level constants (DEFAULT_EXTENSION_PATH is computed at load time)
// So we test against the actual homedir value

const originalExecPath = process.execPath;
const originalArgv = [...process.argv];

describe("resources.ts", () => {
    afterEach(() => {
        Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
        process.argv = [...originalArgv];
    });

    describe("resolveResource", () => {
        test("should resolve to home path if bundled path doesn't exist", () => {
            // Use a non-existent execPath so bundled path check fails
            Object.defineProperty(process, 'execPath', { value: "/nonexistent/bin/pickle", configurable: true });

            const path = resources.resolveResource("skills/test.md");

            // Should fallback to home path
            const expectedHomeBase = join(homedir(), ".gemini/extensions/pickle-rick");
            expect(path).toBe(join(expectedHomeBase, "skills/test.md"));
        });
    });

    describe("resolveSkillPath", () => {
        test("should return empty string if no paths exist", () => {
            // Use a non-existent execPath
            Object.defineProperty(process, 'execPath', { value: "/nonexistent/bin/pickle", configurable: true });

            expect(resources.resolveSkillPath("nonexistent-skill-xyz")).toBe("");
        });
    });

    describe("getExtensionRoot", () => {
        test("should return home path by default", () => {
            // Use a non-existent execPath so bundled check fails
            Object.defineProperty(process, 'execPath', { value: "/nonexistent/bin/pickle", configurable: true });

            const expectedHomeBase = join(homedir(), ".gemini/extensions/pickle-rick");
            expect(resources.getExtensionRoot()).toBe(expectedHomeBase);
        });
    });

    describe("getCliCommand", () => {
        test("should handle runtime (bun/node)", () => {
            Object.defineProperty(process, 'execPath', { value: "/usr/bin/bun", configurable: true });
            process.argv[1] = "/path/to/script.ts";

            expect(resources.getCliCommand()).toBe('"/usr/bin/bun" "/path/to/script.ts"');
        });

        test("should handle standalone binary", () => {
            Object.defineProperty(process, 'execPath', { value: "/usr/local/bin/pickle", configurable: true });

            expect(resources.getCliCommand()).toBe('"/usr/local/bin/pickle"');
        });
    });
});
