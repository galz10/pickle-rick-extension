import { mock, expect, test, describe, beforeEach } from "bun:test";

const mockGit = {
        status: mock(async () => ({ files: [], current: "main" })),
        stash: mock(async () => {}),
        checkout: mock(async () => {}),
        pull: mock(async () => ({ catch: () => ({}) })),
        checkoutLocalBranch: mock(async () => {}),
        branchLocal: mock(async () => ({ all: ["main"], current: "main" })),
};

mock.module("simple-git", () => ({
        default: mock(() => mockGit),
        simpleGit: mock(() => mockGit),
}));

import * as branchService from "./branch.js";

describe("Branch Service", () => {
        beforeEach(() => {
                // Reset mockGit manual mocks
                Object.values(mockGit).forEach(m => m.mockClear());

                // Setup default behaviors
                mockGit.status.mockResolvedValue({ files: [], current: "main" } as any);
                mockGit.branchLocal.mockResolvedValue({ all: ["main", "master"], current: "main" } as any);
                mockGit.pull.mockResolvedValue({ catch: () => ({}) } as any);
        });

        describe("slugify", () => {
                test("should convert text to kebab-case", () => {
                        expect(branchService.slugify("Feature: Add tests")).toBe("feature-add-tests");
                });

                test("should remove special characters", () => {
                        expect(branchService.slugify("Fix! @bug #123")).toBe("fix-bug-123");
                });

                test("should limit length to 50 characters", () => {
                        const long = "a".repeat(100);
                        expect(branchService.slugify(long)).toHaveLength(50);
                });

                test("should trim dashes from ends", () => {
                        expect(branchService.slugify("-start-and-end-")).toBe("start-and-end");
                });
        });

        describe("createTaskBranch", () => {
                test("should create a branch with slugified task name", async () => {
                        const branchName = await branchService.createTaskBranch("New Task", "main");
                        expect(branchName).toBe("pickle/new-task");
                        expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith("pickle/new-task");
                });

                test("should stash if there are uncommitted changes", async () => {
                        mockGit.status.mockResolvedValue({ files: ["file1.ts"], current: "main" } as any);

                        await branchService.createTaskBranch("New Task", "main");

                        expect(mockGit.stash).toHaveBeenCalledWith(["push", "-m", "pickle-autostash"]);
                        expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
                });

                test("should checkout and pull base branch", async () => {
                        await branchService.createTaskBranch("New Task", "main");

                        expect(mockGit.checkout).toHaveBeenCalledWith("main");
                        expect(mockGit.pull).toHaveBeenCalledWith("origin", "main");
                });

                test("should fallback to checkout if checkoutLocalBranch fails", async () => {
                        mockGit.checkoutLocalBranch.mockRejectedValue(new Error("Already exists"));

                        await branchService.createTaskBranch("New Task", "main");

                        expect(mockGit.checkout).toHaveBeenCalledWith("pickle/new-task");
                });
        });

        describe("getCurrentBranch", () => {
                test("should return current branch from status", async () => {
                        mockGit.status.mockResolvedValue({ current: "feature-branch" } as any);
                        const branch = await branchService.getCurrentBranch(undefined, mockGit as any);
                        expect(branch).toBe("feature-branch");
                });
        });

        describe("getDefaultBaseBranch", () => {
                test("should prefer main if available", async () => {
                        mockGit.branchLocal.mockResolvedValue({ all: ["main", "master"], current: "main" } as any);
                        const base = await branchService.getDefaultBaseBranch();
                        expect(base).toBe("main");
                });

                test("should use master if main is missing", async () => {
                        mockGit.branchLocal.mockResolvedValue({ all: ["master", "other"], current: "master" } as any);
                        const base = await branchService.getDefaultBaseBranch();
                        expect(base).toBe("master");
                });

                test("should fallback to current branch if neither main nor master exists", async () => {
                        mockGit.branchLocal.mockResolvedValue({ all: ["dev"], current: "dev" } as any);
                        const base = await branchService.getDefaultBaseBranch();
                        expect(base).toBe("dev");
                });
        });

        describe("hasUncommittedChanges", () => {
                test("should return true if status has files", async () => {
                        mockGit.status.mockResolvedValue({ files: ["one"] } as any);
                        expect(await branchService.hasUncommittedChanges()).toBe(true);
                });

                test("should return false if status has no files", async () => {
                        mockGit.status.mockResolvedValue({ files: [] } as any);
                        expect(await branchService.hasUncommittedChanges()).toBe(false);
                });
        });

        describe("getGitStatusInfo", () => {
                test("should return mapped status info", async () => {
                        mockGit.status.mockResolvedValue({
                                current: "main",
                                ahead: 2,
                                behind: 1,
                                files: ["file.ts"]
                        } as any);

                        const info = await branchService.getGitStatusInfo();
                        expect(info).toEqual({
                                branch: "main",
                                ahead: 2,
                                behind: 1,
                                modified: 1,
                                isClean: false
                        });
                });

                test("should return default info on error", async () => {
                        mockGit.status.mockRejectedValue(new Error("Git error"));
                        const info = await branchService.getGitStatusInfo();
                        expect(info.branch).toBe("unknown");
                        expect(info.isClean).toBe(true);
                });
        });
});
