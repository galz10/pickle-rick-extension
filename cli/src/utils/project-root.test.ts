import { expect, test, describe, mock } from "bun:test";
import { join } from "node:path";

// Mock node:fs BEFORE importing findProjectRoot
const mockExistsSync = mock((path: string) => {
  if (path === join("/home/user/project", ".git")) return true;
  if (path === join("/home/user/project/sub", "package.json")) return false;
  if (path === join("/home/user/root-marker", ".pickle-root")) return true;
  return false;
});

mock.module("node:fs", () => ({
  existsSync: mockExistsSync
}));

// Now import the function that uses the mocked module
import { findProjectRoot } from "./project-root.js";

describe("project-root.ts", () => {
  test("should find root based on .git marker", () => {
    const root = findProjectRoot("/home/user/project/sub/dir");
    expect(root).toBe("/home/user/project");
    expect(mockExistsSync).toHaveBeenCalledWith(join("/home/user/project", ".git"));
  });

  test("should find root based on .pickle-root marker", () => {
    const root = findProjectRoot("/home/user/root-marker/some/nested/path");
    expect(root).toBe("/home/user/root-marker");
  });

  test("should fallback to startDir if no markers found", () => {
    mockExistsSync.mockClear();
    const root = findProjectRoot("/outside/everywhere");
    // It will check markers at /outside/everywhere, then /outside, then /
    // Since none match, it should return the startDir
    expect(root).toBe("/outside/everywhere");
  });
});
