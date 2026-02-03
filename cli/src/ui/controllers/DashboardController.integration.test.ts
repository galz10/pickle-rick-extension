import { expect, test, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import "../test-setup.js";
import { createMockRenderer } from "../mock-factory.js";
import { DashboardController } from "./DashboardController.js";
import * as search from "../../utils/search.js";
import * as state from "../../services/config/state.js";

describe("DashboardController Integration", () => {
  let mockRenderer: any;
  let mockSessionContainer: any;
  let mockSidebar: any;
  let spies: any[] = [];

  beforeEach(() => {
    mockRenderer = createMockRenderer();
    mockSessionContainer = { add: mock(() => {}), getChildren: mock(() => []) };
    mockSidebar = { onHide: null, root: { visible: false }, isOpen: () => false, hide: mock(() => {}), update: mock(() => {}) };

    spies = [
      spyOn(search, "recursiveSearch").mockImplementation(async (dir, query) => {
        if (query === "test") {
          return { files: ["/root/test.ts"], truncated: false };
        }
        return { files: [], truncated: false };
      }),
      spyOn(state, "listSessions").mockResolvedValue([]),
      spyOn(state, "createSession").mockResolvedValue({ session_dir: "/tmp/session" } as any),
    ];
  });

  afterEach(() => {
    spies.forEach(s => s.mockRestore());
  });

  test("should initialize controller", () => {
    const controller = new DashboardController(
      mockRenderer,
      mockSessionContainer,
      mockSidebar
    );

    expect(controller).toBeDefined();
  });
});
