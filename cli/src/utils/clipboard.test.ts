import { expect, test, describe, mock, beforeEach, afterEach, beforeAll, spyOn } from "bun:test";

// 1. Setup Mocks
const mockPlatform = mock(() => "darwin");
const mockWhich = mock((tool: string) => tool === "pbcopy" ? "/usr/bin/pbcopy" : null);

// Mock spawn
const mockSpawn = mock(() => ({
    stdin: {
        write: mock(() => {}),
        end: mock(() => {}),
    },
    exited: Promise.resolve(),
}));

mock.module("node:os", () => ({
    platform: mockPlatform
}));

// Mock Bun global properties
// Bun.which and Bun.spawn are globals
// We'll use a dynamic import and see if we can spy on the globals
import { Clipboard } from "./clipboard.js";

describe("clipboard.ts", () => {
    beforeAll(() => {
        // @ts-ignore
        globalThis.Bun.which = mockWhich;
        // @ts-ignore
        globalThis.Bun.spawn = mockSpawn;
    });

    beforeEach(() => {
        mockPlatform.mockClear();
        mockWhich.mockClear();
        mockSpawn.mockClear();
    });

    test("should copy text on darwin using pbcopy", async () => {
        mockPlatform.mockReturnValue("darwin");
        mockWhich.mockImplementation((tool) => tool === "pbcopy" ? "/usr/bin/pbcopy" : null);

        await Clipboard.copy("hello world");

        expect(mockSpawn).toHaveBeenCalled();
        const args = mockSpawn.mock.calls[0][0] as string[];
        expect(args[0]).toBe("pbcopy");
    });

    test("should copy text on linux using xclip if wl-copy is missing", async () => {
        mockPlatform.mockReturnValue("linux");
        mockWhich.mockImplementation((tool) => {
            if (tool === "wl-copy") return null;
            if (tool === "xclip") return "/usr/bin/xclip";
            return null;
        });

        await Clipboard.copy("linux test");

        expect(mockSpawn).toHaveBeenCalled();
        const args = mockSpawn.mock.calls[0][0] as string[];
        expect(args[0]).toBe("xclip");
    });

    test("should copy text on win32 using powershell", async () => {
        mockPlatform.mockReturnValue("win32");
        
        await Clipboard.copy("win test");

        expect(mockSpawn).toHaveBeenCalled();
        const args = mockSpawn.mock.calls[0][0] as string[];
        expect(args).toContain("powershell.exe");
        expect(args).toContain("Set-Clipboard");
    });

    test("should warn if no clipboard support found", async () => {
        mockPlatform.mockReturnValue("linux");
        mockWhich.mockReturnValue(null);
        const spy = spyOn(console, "warn").mockImplementation(() => {});

        await Clipboard.copy("no support");

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
