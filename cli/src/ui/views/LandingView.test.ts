import { expect, test, describe, mock, beforeEach } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.ts";

mock.module("../file-picker-utils.js", () => ({
  setupFilePicker: mock(() => () => {}),
}));

import { createLandingView } from "./LandingView.js";

describe("LandingView", () => {
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should create landing view", async () => {
    const view = await createLandingView(mockRenderer);
    expect(view.root).toBeDefined();
    expect(view.input).toBeDefined();
  });
});
