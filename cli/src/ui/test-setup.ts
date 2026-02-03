import { mock } from "bun:test";

export class MockRenderable {
  public id = "";
  public visible = true;
  public zIndex = 0;
  public _children: any[] = [];
  public _handlers: Record<string, Function[]> = {};
  public _ctx: any;
  
  constructor(renderer: any, options: any) {
    this._ctx = renderer;
    this.id = options?.id || "";
    this.visible = options?.visible !== false;
    this._children = [];
    this._handlers = {};
  }

  public add(child: any) { 
    if (child) this._children.push(child); 
  }
  public remove(id: string) { 
    this._children = this._children.filter((c: any) => c.id !== id); 
  }
  public getChildren() { 
    return this._children || []; 
  }
  public destroy() {}
  public destroyRecursively() {}
  public onMouse() {}
  public focus() {}
  public blur() {}
  public requestRender() {}
  
  public on(event: string, handler: Function) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }
  
  public off(event: string, handler: Function) {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter((h: any) => h !== handler);
    }
  }
  
  public emit(event: string, ...args: any[]) {
    if (this._handlers[event]) {
      this._handlers[event].forEach((h: any) => h(...args));
    }
  }
}

export class MockCliRenderer {
  public root = new MockRenderable(null, { id: "root" });
  public keyInput: any;
  public _internalKeyInput: any;
  public requestRender = mock(() => {});
  public addInputHandler = mock(() => {});
  public registerLifecyclePass = mock(() => {});
  public on = mock(() => {});
  public off = mock(() => {});
  public start = mock(() => {});
  public stop = mock(() => {});
  public getSelection = mock(() => ({ isSelecting: false }));
  public clearSelection = mock(() => {});
  public focusRenderable = mock(() => {});
  public useMouse = false;

  constructor() {
    this.keyInput = {
      on: mock(function(this: any, event: string, handler: Function) {
        if (!this._handlers) this._handlers = {};
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
      }),
      off: mock(function(this: any, event: string, handler: Function) {
        if (this._handlers && this._handlers[event]) {
          this._handlers[event] = this._handlers[event].filter((h: any) => h !== handler);
        }
      }),
      emit: mock(function(this: any, event: string, ...args: any[]) {
        if (this._handlers && this._handlers[event]) {
          this._handlers[event].forEach((h: any) => h(...args));
        }
      }),
      removeListener: mock(() => {}),
      _handlers: {} as Record<string, Function[]>
    };
    this._internalKeyInput = {
      onInternal: mock(() => {}),
      offInternal: mock(() => {}),
    };
  }
}

export const mockAppendFile = mock(async () => {});
export const mockMkdir = mock(async () => {});
export const mockWriteFile = mock(async () => {});
export const mockReadFile = mock(async () => "mock content");

// Global mock registration
mock.module("@opentui/core", () => {
  return {
    CliRenderer: MockCliRenderer,
    createCliRenderer: mock(async () => new MockCliRenderer()),
    Renderable: MockRenderable,
    InputRenderable: class extends MockRenderable {
      public height = 1;
      public plainText = "";
      public value = "";
      public virtualLineCount = 1;
      public maxLength = 1000;
      public yogaNode = { markDirty: mock(() => {}) };
      public placeholder = "";
      public _placeholder = "";
      public position = "relative";
      public onContentChange: () => void = () => {};
      constructor(ctx: any, options: any) { 
        super(ctx, options);
        this.value = options?.value || ""; 
        this.plainText = this.value;
        this.maxLength = options?.maxLength ?? 1000;
        this.height = options?.height ?? 1;
        
        // Ensure methods that might be overridden in subclasses are on the prototype OR
        // allow them to be shadowed by subclass properties.
        // We'll keep them as instance properties for now but use bind to allow super calls
      }
      public deleteCharBackward = mock(() => true);
      public deleteChar = mock(() => true);
      public handleKeyPress = mock(() => true);
      public newLine = mock(() => true);
      public handlePaste = mock(() => {});
      public insertText = mock(function(this: any, text: string) { this.plainText += text; });
      public setText = mock(function(this: any, text: string) { this.plainText = text; });
      public submit = mock(() => true);
      public removeHighlightsByRef = mock(() => {});
      public addHighlightByCharRange = mock(() => {});
      public syntaxStyle = { registerStyle: mock(() => 1), destroy: mock(() => {}) };
    },
    BoxRenderable: class extends MockRenderable {
      public backgroundColor: any = { r: 0, g: 0, b: 0, a: 1 };
      public borderColor: any = { r: 0, g: 0, b: 0, a: 1 };
      public right = 0;
      public height: any = 0;
      public minHeight = 0;
      public flexDirection = "column";
      public alignItems = "stretch";
      public justifyContent = "flex-start";
      public paddingTop = 0;
      constructor(renderer: any, options: any) {
        super(renderer, options);
        this.height = options?.height || 0;
        this.minHeight = options?.minHeight || 0;
        if (options?.backgroundColor) {
          this.backgroundColor = typeof options.backgroundColor === 'string'
            ? { r: 0, g: 0, b: 0, a: 1, toString: () => options.backgroundColor }
            : options.backgroundColor;
        }
        if (options?.borderColor) {
          this.borderColor = typeof options.borderColor === 'string'
            ? { r: 0, g: 0, b: 0, a: 1, toString: () => options.borderColor }
            : options.borderColor;
        }
      }
    },
    ScrollBoxRenderable: class extends MockRenderable {
      public stopAutoScroll = mock(() => {});
    },
    TextRenderable: class extends MockRenderable {
      public content = "";
      public fg = "";
      constructor(renderer: any, options: any) { 
        super(renderer, options);
        this.content = options?.content || ""; 
      }
    },
    SelectRenderable: class extends MockRenderable {
      public options: any[] = [];
      constructor(renderer: any, options: any) {
        super(renderer, options);
        this.options = options?.options || [];
      }
      public setSelectedIndex = mock(() => {});
      public moveUp = mock(() => {});
      public moveDown = mock(() => {});
      public selectCurrent = mock(() => {});
    },
    TabSelectRenderable: class extends MockRenderable {
      constructor(renderer: any, options: any) {
        super(renderer, options);
      }
    },
    ASCIIFontRenderable: class extends MockRenderable {},
    DiffRenderable: class extends MockRenderable {},
    FrameBufferRenderable: class extends MockRenderable {},
    MarkdownRenderable: class extends MockRenderable {},
    fg: () => (text: string) => text,
    RGBA: { 
      fromValues: mock((r: number, g: number, b: number, a: number) => ({ r, g, b, a, toString: () => `rgba(${r},${g},${b},${a})` })),
      fromHex: mock((hex: string) => {
        if (typeof hex !== 'string') return { r: 0, g: 0, b: 0, a: 1, toString: () => String(hex) };
        const r = parseInt(hex.slice(1, 3), 16) || 0;
        const g = parseInt(hex.slice(3, 5), 16) || 0;
        const b = parseInt(hex.slice(5, 7), 16) || 0;
        return { r, g, b, a: 1, toString: () => hex };
      }),
      fromInts: mock((r: number, g: number, b: number, a: number) => ({ r, g, b, a, toString: () => `rgba(${r},${g},${b},${a})` })),
    },
    parseColor: mock((c: string) => {
      if (typeof c === 'string' && c.startsWith("#")) {
        const r = parseInt(c.slice(1, 3), 16) || 0;
        const g = parseInt(c.slice(3, 5), 16) || 0;
        const b = parseInt(c.slice(5, 7), 16) || 0;
        return { r, g, b, a: 1, toString: () => c };
      }
      return { r: 0, g: 0, b: 0, a: 1, toString: () => String(c) };
    }),
    parseColorHex: mock((hex: string) => {
      if (typeof hex !== 'string') return { r: 0, g: 0, b: 0, a: 1, toString: () => String(hex) };
      const r = parseInt(hex.slice(1, 3), 16) || 0;
      const g = parseInt(hex.slice(3, 5), 16) || 0;
      const b = parseInt(hex.slice(5, 7), 16) || 0;
      return { r, g, b, a: 1, toString: () => hex };
    }),
    rgbToHex: mock((rgbaOrR: any, gArg?: number, bArg?: number) => {
      // Handle both RGBA object and individual numbers
      const r = typeof rgbaOrR === 'object' ? rgbaOrR.r : rgbaOrR;
      const g = typeof rgbaOrR === 'object' ? rgbaOrR.g : gArg ?? 0;
      const b = typeof rgbaOrR === 'object' ? rgbaOrR.b : bArg ?? 0;
      const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }),
    createTimeline: mock(() => {
      const tl: any = {
        _actions: [] as Function[],
        add: function(target: any, options: any) {
          const { onUpdate, onComplete, duration, ease, ...props } = options || {};
          const anim = { progress: 1 };
          tl._actions.push(() => {
            if (target) Object.assign(target, props);
            if (onUpdate) onUpdate(anim);
            if (onComplete) onComplete(anim);
          });
          queueMicrotask(() => {
            while (tl._actions.length > 0) {
              const action = tl._actions.shift();
              if (action) action();
            }
          });
          return tl;
        },
        play: function() {
          while (tl._actions.length > 0) {
            const action = tl._actions.shift();
            if (action) action();
          }
          return tl;
        },
        pause: function() { return tl; },
      };
      return tl;
    }),
    StyledText: class { 
      constructor(public chunks: any[]) {}
      public toString() {
        return this.chunks.map(c => typeof c === 'string' ? c : (c.text || '')).join('');
      }
    },
    TextAttributes: { BOLD: 1 },
    Timeline: class {},
    SelectRenderableEvents: { CHANGE: "change", SELECTION_CHANGED: "selection_changed", ITEM_SELECTED: "item_selected" },
    TabSelectRenderableEvents: { CHANGE: "change" },
    InputRenderableEvents: {
      ENTER: "enter",
      INPUT: "input",
      SUBMIT: "submit",
    },
    RenderableEvents: {
      FOCUS: "focus",
      BLUR: "blur",
    },
    SyntaxStyle: { 
      create: mock(() => ({ registerStyle: mock(() => 1), destroy: mock(() => {}) })),
      fromStyles: mock(() => ({ registerStyle: mock(() => 1), destroy: mock(() => {}) })),
    },
    MouseParser: class {
      parseMouseEvent = mock(() => null);
    },
    engine: {
      attach: mock(() => {}),
    },
    MouseParserEvents: {
      MOUSE_DOWN: "mousedown",
      MOUSE_UP: "mouseup",
      MOUSE_MOVE: "mousemove",
      MOUSE_WHEEL: "mousewheel",
    }
  };
});
