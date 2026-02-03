import { expect, test, describe } from "bun:test";
import { launchGameboy, launchSnake } from "./index.js";

describe("Games Index", () => {
  test("should export launch functions", () => {
    expect(launchGameboy).toBeDefined();
    expect(launchSnake).toBeDefined();
  });
});
