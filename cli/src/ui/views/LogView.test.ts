import { expect, test, describe, mock, beforeEach } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.ts";

mock.module("node:fs/promises", () => ({
  readFile: mock(async () => "line1\nline2\nline3"),
  stat: mock(async () => ({ size: 100 })),
}));

import { LogView } from "./LogView.js";

describe("LogView", () => {
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should initialize", () => {
    const view = new LogView(mockRenderer, "test.log");
    expect(view).toBeDefined();
    expect(view.root).toBeDefined();
  });
});
