import { expect, test, describe, mock, beforeEach } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.ts";
import { BoxRenderable } from "@opentui/core";

import { ToyboxView } from "./ToyboxView.js";

describe("ToyboxView", () => {
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should initialize with container", () => {
    const onBack = mock(() => {});
    const mockContainer = new BoxRenderable(mockRenderer, { id: "toybox-container" });
    const view = new ToyboxView(mockRenderer, mockContainer, undefined, onBack);

    expect(view["container"]).toBeDefined();
    expect(view["toys"].length).toBeGreaterThan(0);
  });

  test("should have enable and disable methods", () => {
    const mockContainer = new BoxRenderable(mockRenderer, { id: "toybox-container" });
    const view = new ToyboxView(mockRenderer, mockContainer);

    expect(typeof view.enable).toBe("function");
    expect(typeof view.disable).toBe("function");
  });

  test("should have destroy method", () => {
    const mockContainer = new BoxRenderable(mockRenderer, { id: "toybox-container" });
    const view = new ToyboxView(mockRenderer, mockContainer);

    expect(typeof view.destroy).toBe("function");
  });

  test("should create card renderables for toys", () => {
    const mockContainer = new BoxRenderable(mockRenderer, { id: "toybox-container" });
    const view = new ToyboxView(mockRenderer, mockContainer);

    // Should have cards for each toy
    expect(view["cardRenderables"].length).toBe(view["toys"].length);
  });
});
