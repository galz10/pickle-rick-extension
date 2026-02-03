import { mock, expect, test, describe, beforeEach } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.ts";

import { MultiLineInputRenderable, MultiLineInputEvents } from "./MultiLineInput.ts";

describe("MultiLineInputRenderable", () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = createMockRenderer();
  });

  test("should initialize", () => {
    const input = new MultiLineInputRenderable(mockCtx, {
      id: "test-input",
    });

    expect(input).toBeDefined();
  });

  test("should export MultiLineInputEvents", () => {
    // Verify the enum exists
    expect(MultiLineInputEvents).toBeDefined();
    expect(MultiLineInputEvents.INPUT).toBeDefined();
  });
});
