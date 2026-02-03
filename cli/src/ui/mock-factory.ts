import { mock } from "bun:test";
import { MockCliRenderer } from "./test-setup.js";

export const createMockRenderer = () => {
  return new MockCliRenderer();
};
