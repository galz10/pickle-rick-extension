import { expect, test, describe, mock } from "bun:test";
import { createMockRenderer } from "./mock-factory.ts";

// Mock views, controllers, and components
mock.module("./views/LandingView.js", () => ({
  createLandingView: async () => ({
    root: { visible: false, focus: mock(() => {}) },
    input: { focus: mock(() => {}) },
  }),
}));

mock.module("./controllers/DashboardController.js", () => ({
  DashboardController: class {
    spawnSession = mock(() => {});
    hasActivePicker = () => false;
    constructor() {}
  },
}));

mock.module("./components/MultiLineInput.js", () => ({
  MultiLineInputRenderable: class {
    id = "";
    focus = mock(() => {});
    on = mock(() => {});
    constructor(_1: never, opts: { id: string }) { this.id = opts.id; }
  },
  MultiLineInputEvents: {
    SUBMIT: "submit",
    INPUT: "input",
  },
}));

import { createDashboard } from "./dashboard.js";

describe("Dashboard", () => {
  test("createDashboard should initialize without crashing", async () => {
    const mockRenderer = createMockRenderer();
    const dashboard = await createDashboard(mockRenderer as any);
    expect(dashboard.root).toBeDefined();
    expect(dashboard.sessionContainer).toBeDefined();
    expect(dashboard.input).toBeDefined();
  });
});
