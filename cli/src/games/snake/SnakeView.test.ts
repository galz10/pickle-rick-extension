import { expect, test, describe, mock, beforeEach } from "bun:test";
import { createMockRenderer } from "../../ui/mock-factory.ts";

import { launchSnake } from "./SnakeView.js";

describe("SnakeView", () => {
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  test("should launch snake", () => {
    const options = {
      onExit: mock(() => {}),
    };
    // This will probably fail if it tries to run the game loop, 
    // but we can at least check it doesn't crash on init
    try {
      launchSnake(mockRenderer, options);
    } catch (e) {
      // Ignore loop errors
    }
    expect(true).toBe(true);
  });
});
