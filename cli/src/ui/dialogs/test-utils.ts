import { mock } from "bun:test";
import type { SessionData } from "../../types/tasks.ts";

export interface MockComponent {
  id: string;
  visible: boolean;
  onMouse?: ((e: { type: string }) => void) | null;
  add?: ReturnType<typeof mock>;
  remove?: ReturnType<typeof mock>;
}

export interface MockBox extends MockComponent {
  backgroundColor?: string;
  opacity: number;
  right: number;
  getChildren: ReturnType<typeof mock>;
}

export interface MockScrollBox extends MockComponent {
  getChildren: ReturnType<typeof mock>;
}

export interface MockText extends MockComponent {
  fg: string;
  content: string;
}

export interface MockSelect extends MockComponent {
  options: Array<{ title: string; value: string; description?: string }>;
  on: ReturnType<typeof mock>;
  emit: (event: string, ...args: Array<string | number | boolean | object>) => void;
  moveUp: ReturnType<typeof mock>;
  moveDown: ReturnType<typeof mock>;
  selectCurrent: ReturnType<typeof mock>;
  setSelectedIndex: ReturnType<typeof mock>;
}

export interface MockInput extends MockComponent {
  focused: boolean;
  value: string;
  focus: ReturnType<typeof mock>;
  blur: ReturnType<typeof mock>;
}

interface MockRenderableOptions {
  id?: string;
  visible?: boolean;
  opacity?: number;
  backgroundColor?: string;
  content?: string;
  fg?: string;
  view?: string;
  diff?: string;
}

export interface MockRenderer {
  requestRender: ReturnType<typeof mock>;
  root: { add: ReturnType<typeof mock> };
  keyInput: {
    on: ReturnType<typeof mock>;
    off: ReturnType<typeof mock>;
    emit: (event: string, ...args: Array<{ name: string; ctrl?: boolean; meta?: boolean } | number | string>) => void;
  };
}

/**
 * Standard mocking strategy for @opentui/core components.
 */
export const createOpentuiMocks = () => {
  const mocks = {
    BoxRenderable: class implements MockBox {
      public visible = true;
      public opacity = 1;
      public id: string;
      public backgroundColor: string | undefined;
      public right: number = 0;
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-box";
        if (options?.visible !== undefined) this.visible = options.visible;
        if (options?.opacity !== undefined) this.opacity = options.opacity;
        if (options?.backgroundColor !== undefined) this.backgroundColor = options.backgroundColor;
      }
      add = mock(() => {});
      remove = mock(() => {});
      getChildren = mock(() => [] as MockComponent[]);
      onMouse = null;
    },
    ScrollBoxRenderable: class implements MockScrollBox {
      public id: string;
      public visible = true;
      private children: MockComponent[] = [];
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-scrollbox";
        this.getChildren = mock(() => this.children);
        this.add = mock((child: MockComponent) => this.children.push(child));
        this.remove = mock((id: string) => {
          this.children = this.children.filter(c => c.id !== id);
        });
      }
      add: ReturnType<typeof mock> = mock(() => {});
      getChildren: ReturnType<typeof mock> = mock(() => []);
      remove: ReturnType<typeof mock> = mock(() => {});
    },
    TextRenderable: class implements MockText {
      public id: string;
      public visible = true;
      public fg = "";
      public content: string = "";
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-text";
        this.content = options?.content || "";
        this.fg = options?.fg || "";
      }
      onMouse = null;
    },
    DiffRenderable: class implements MockComponent {
      public id: string;
      public visible = true;
      public diff: string = "";
      public view: string = "";
      public filetype: string = "";
      public wrapMode: string = "";
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-diff";
        this.diff = options?.diff || "";
        this.view = options?.view || "unified";
      }
      destroy = mock(() => {});
    },
    SelectRenderable: class implements MockSelect {
      public id: string;
      public visible = true;
      public options: Array<{ name: string; value: string; description?: string }> = [];
      private handlers: Record<string, Function[]> = {};
      constructor(public renderer: MockRenderer, public options_init: MockRenderableOptions) {
        this.id = options_init?.id || "mock-select";
      }
      on = mock((event: string, handler: Function) => {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
      });
      emit = (event: string, ...args: Array<string | number | boolean | object>) => {
        this.handlers[event]?.forEach(h => h(...args));
      };
      moveUp = mock(() => {});
      moveDown = mock(() => {});
      selectCurrent = mock(() => {});
      setSelectedIndex = mock(() => {});
    },
    InputRenderable: class implements MockInput {
      public id: string;
      public visible = true;
      public focused = false;
      public value = "";
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-input";
      }
      focus = mock(() => { this.focused = true; });
      blur = mock(() => { this.focused = false; });
    },
    MarkdownRenderable: class implements MockComponent {
      public id: string;
      public visible = true;
      public content = "";
      constructor(public renderer: MockRenderer, public options: MockRenderableOptions) {
        this.id = options?.id || "mock-markdown";
      }
    },
    createTimeline: mock(() => ({
      add: mock((target: { opacity: number }, options: { opacity?: number; onComplete?: () => void }) => {
        if (options.opacity !== undefined) target.opacity = options.opacity;
        if (options.onComplete) options.onComplete();
        return { play: mock(() => {}) };
      }),
      play: mock(() => {}),
    })),
    TextAttributes: { BOLD: 1 },
    RGBA: { fromInts: mock(() => ({})), fromValues: mock(() => ({})) },
    parseColor: mock(() => ({})),
    SyntaxStyle: { fromStyles: mock(() => ({ destroy: mock(() => {}) })) },
    SelectRenderableEvents: { SELECTION_CHANGED: "selection_changed", ITEM_SELECTED: "item_selected" },
  };
  return mocks;
};

export const gitMock = {
  getChangedFiles: mock(async () => [] as Array<{ path: string; status: string; additions: number; deletions: number }>),
  getFileDiff: mock(async () => ""),
  getFileType: mock(() => "typescript"),
  getStatusIndicator: mock(() => "M"),
  getStatusColor: mock(() => "#ffffff"),
  generatePRDescription: mock(async () => ({ title: "", body: "" })),
};

export const createMockRenderer = (): MockRenderer => {
  const handlers: Record<string, Function[]> = {};
  return {
    requestRender: mock(() => {}),
    root: { add: mock(() => {}) },
    keyInput: {
      on: mock((event: string, handler: Function) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      off: mock((event: string, handler: Function) => {
        if (handlers[event]) {
          handlers[event] = handlers[event].filter(h => h !== handler);
        }
      }),
      emit: (event: string, ...args: Array<{ name: string; ctrl?: boolean; meta?: boolean } | number | string>) => {
        handlers[event]?.forEach(h => h(...args));
      }
    }
  };
};

/**
 * Creates a valid SessionData mock for tests.
 */
export const createMockSession = (overrides: Partial<SessionData> = {}): SessionData => {
  return {
    id: "sessions/test",
    prompt: "test prompt",
    startTime: Date.now(),
    status: "Running",
    engine: "gemini",
    isPrdMode: false,
    iteration: 1,
    history: [],
    ...overrides,
  } as SessionData;
};
