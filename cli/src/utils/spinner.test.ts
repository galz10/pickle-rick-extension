import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { Spinner } from "./spinner.js";

describe("Spinner Utility", () => {
    let spinner: Spinner;
    let originalWrite: any;
    let mockWrite: any;

    beforeEach(() => {
        originalWrite = process.stdout.write;
        mockWrite = mock(() => true);
        process.stdout.write = mockWrite;
        spinner = new Spinner();
    });

    afterEach(() => {
        if (spinner['timer']) {
            clearInterval(spinner['timer']);
        }
        process.stdout.write = originalWrite;
    });

    test("should start and create newline", () => {
        spinner.start("Thinking...");
        const calls = mockWrite.mock.calls.flat();
        expect(calls).toContain("\x1B[?25l");
        expect(calls).toContain("\n"); // Check for the initial newline
        expect(calls.some((c: string) => c.includes("Thinking..."))).toBe(true);
    });

    test("should stop and show cursor", () => {
        spinner.start("Work");
        mockWrite.mockClear();
        spinner.stop("Done");
        
        const calls = mockWrite.mock.calls.flat();
        expect(calls).toContain("\x1B[?25h");
    });

    test("should use move-up logic in printAbove", () => {
        spinner.start("Spinning");
        mockWrite.mockClear();
        
        spinner.printAbove("Log message");
        
        const calls = mockWrite.mock.calls.flat();
        // Sequence: Clear -> Up -> Content -> Newline -> Render
        expect(calls[0]).toBe('\r\x1B[K');
        expect(calls[1]).toBe('\x1B[1A'); // The key fix
        expect(calls[2]).toBe("Log message");
        expect(calls[3]).toBe("\n");
        expect(calls[4]).toContain("Spinning");
    });
});
