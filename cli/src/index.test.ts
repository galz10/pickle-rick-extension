import { expect, test, describe, mock } from "bun:test";

mock.module("commander", () => ({
  program: {
    name: mock(() => ({ description: mock(() => ({ version: mock(() => ({ 
      action: mock(() => ({ parse: mock(() => {}) })) 
    })) })) })),
    command: mock(() => ({
      description: mock(() => ({
        action: mock(() => {})
      }))
    })),
    parse: mock(() => {})
  }
}));

import "./index.js";

describe("CLI Entry Point", () => {
  test("index.ts should load without errors", () => {
    // If we got here, it loaded
    expect(true).toBe(true);
  });
});
