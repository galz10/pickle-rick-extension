import { expect, test, describe, beforeEach, mock } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.js";
import { createLandingView } from "./LandingView.js";

describe("LandingView Integration", () => {
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should create landing view", async () => {
    const onEnter = mock(() => {});
    const result = await createLandingView(mockRenderer as any, onEnter);

    expect(result).toBeDefined();
    expect(result.root).toBeDefined();
    expect(result.input).toBeDefined();
  });
});
