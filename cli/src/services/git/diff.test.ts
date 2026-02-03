import { mock, expect, test, describe, beforeEach } from "bun:test";

const mockGit = {
        diffSummary: mock(async () => ({ files: [] })),
        raw: mock(async () => ""),
        status: mock(async () => ({ not_added: [], created: [], deleted: [] })),
        diff: mock(async () => ""),
        show: mock(async () => ""),
};

mock.module("simple-git", () => ({
        default: mock(() => mockGit),
        simpleGit: mock(() => mockGit),
}));

mock.module("node:fs/promises", () => ({
        readFile: mock(async () => "line1\nline2"),
}));

import * as diffService from "./diff.js";

describe("Diff Service", () => {
        beforeEach(() => {
                Object.values(mockGit).forEach(m => m.mockClear());
        });

        describe("getChangedFiles", () => {
                test("should combine committed and uncommitted changes", async () => {
                        mockGit.diffSummary.mockResolvedValueOnce({
                                files: [{ file: "file1.ts", insertions: 10, deletions: 5 }]
                        } as any);
                        mockGit.raw.mockResolvedValueOnce("A\tfile1.ts");

                        const files = await diffService.getChangedFiles("/wt", "main", mockGit as any);
                        expect(files).toHaveLength(1);
                        expect(files[0].path).toBe("file1.ts");
                        expect(files[0].status).toBe("added");
                });

                test("should handle renamed files in committed diff", async () => {
                        mockGit.diffSummary.mockResolvedValueOnce({
                                files: [{ file: "old.ts => new.ts" }]
                        } as any);

                        const files = await diffService.getChangedFiles("/wt", "main", mockGit as any);
                        expect(files[0].status).toBe("renamed");
                        expect(files[0].oldPath).toBe("old.ts");
                        expect(files[0].path).toBe("new.ts");
                });

                test("should handle complex renamed files (with braces)", async () => {
                        mockGit.diffSummary.mockResolvedValueOnce({
                                files: [{ file: "src/{old.ts => new.ts}" }]
                        } as any);

                        const files = await diffService.getChangedFiles("/wt", "main", mockGit as any);
                        expect(files[0].status).toBe("renamed");
                        expect(files[0].oldPath).toBe("src/old.ts");
                        expect(files[0].path).toBe("src/new.ts");
                });

                test("should include untracked and deleted files from status", async () => {
                        mockGit.status.mockResolvedValueOnce({
                                not_added: ["untracked.ts"],
                                created: [],
                                deleted: ["gone.ts"]
                        } as any);

                        const files = await diffService.getChangedFiles("/wt", "main", mockGit as any);
                        expect(files.find(f => f.path === "untracked.ts")?.status).toBe("added");
                        expect(files.find(f => f.path === "gone.ts")?.status).toBe("deleted");
                });
        });

        describe("getFileDiff", () => {
                test("should return diff for existing file", async () => {
                        mockGit.diff.mockResolvedValueOnce("some diff");
                        const diff = await diffService.getFileDiff("/wt", "main", "file.ts", "modified", mockGit as any);
                        expect(diff).toBe("some diff");
                });

                test("should create synthetic diff for new files", async () => {
                        mockGit.diff.mockResolvedValueOnce("");
                        mockGit.show.mockRejectedValueOnce(new Error("No such file in base"));

                        const diff = await diffService.getFileDiff("/wt", "main", "new.ts", "added", mockGit as any);
                        expect(diff).toContain("new file mode 100644");
                        expect(diff).toContain("+line1");
                });
        });

        describe("getFileType", () => {
                test("should return correct language for extensions", () => {
                        expect(diffService.getFileType("test.ts")).toBe("typescript");
                        expect(diffService.getFileType("app.jsx")).toBe("javascript");
                        expect(diffService.getFileType("README.md")).toBe("markdown");
                });

                test("should return text for unknown extensions", () => {
                        expect(diffService.getFileType("config.unknown")).toBe("text");
                        expect(diffService.getFileType("no-ext")).toBe("text");
                });
        });

        describe("getStatusIndicator", () => {
                test("should return correct character", () => {
                        expect(diffService.getStatusIndicator("added")).toBe("A");
                        expect(diffService.getStatusIndicator("modified")).toBe("M");
                        expect(diffService.getStatusIndicator("deleted")).toBe("D");
                        expect(diffService.getStatusIndicator("renamed")).toBe("R");
                });
        });
});
