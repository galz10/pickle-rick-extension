import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  CliRenderer,
  MouseEvent,
  createTimeline,
  RGBA,
} from "@opentui/core";
import { THEME } from "../theme.js";

export interface DialogOption {
  title: string;
  value: string;
  description?: string;
  onSelect: (dialog: Dialog) => void | Promise<void>;
}

export class Dialog {
  public root: BoxRenderable;
  private overlay: BoxRenderable;
  private dialogPanel: BoxRenderable;
  private renderer: CliRenderer;
  private isVisible = false;
  private onShow?: () => void;
  private onHide?: () => void;
  
  private titleText: TextRenderable;
  public content: BoxRenderable;
  private optionsContainer: BoxRenderable;
  private options: DialogOption[] = [];

  constructor(renderer: CliRenderer, title: string) {
    this.renderer = renderer;
    
    // Background overlay
    this.overlay = new BoxRenderable(renderer, {
      id: "dialog-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      left: 0,
      top: 0,
      backgroundColor: RGBA.fromInts(0, 0, 0, 175), // Increased opacity by 10% (150 -> 175)
      visible: false,
      opacity: 0,
      zIndex: 20000,
      justifyContent: "center",
      alignItems: "center",
    });

    // Dialog panel
    this.dialogPanel = new BoxRenderable(renderer, {
      id: "dialog-panel",
      width: 90,
      maxWidth: "92%",
      height: "70%", // Slightly taller for consistent centering
      maxHeight: "80%",
      flexDirection: "column",
      backgroundColor: THEME.bg,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
      zIndex: 20001, // Higher than overlay to ensure clickability
    });

    this.overlay.add(this.dialogPanel);
    this.root = this.overlay;

    this.titleText = new TextRenderable(renderer, {
      id: "dialog-title",
      content: title,
      fg: THEME.white,
      attributes: TextAttributes.BOLD,
      marginBottom: 1,
      width: "100%",
    });
    this.dialogPanel.add(this.titleText);

    // Create a main container that will hold content and options
    const mainContainer = new BoxRenderable(renderer, {
      id: "dialog-main-container",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });

    this.content = new BoxRenderable(renderer, {
      id: "dialog-content",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: THEME.bg,
      paddingLeft: 1,
      paddingRight: 1,
    });
    mainContainer.add(this.content);

    this.optionsContainer = new BoxRenderable(renderer, {
      id: "dialog-options",
      width: "100%",
      flexDirection: "column",
      marginTop: 1,
      paddingTop: 1,
      flexShrink: 0, // Prevent options from shrinking
    });
    mainContainer.add(this.optionsContainer);
    
    this.dialogPanel.add(mainContainer);

    this.setupCloseButton();
  }

  private setupCloseButton() {
    const closeButton = new BoxRenderable(this.renderer, {
      id: "dialog-close",
      width: 5,
      height: 1,
      position: "absolute",
      right: 1,
      top: 1,
      zIndex: 20001,
      justifyContent: "center",
      alignItems: "center",
    });

    const closeText = new TextRenderable(this.renderer, {
      id: "dialog-close-text",
      content: "[X]",
      fg: THEME.dim,
    });
    closeButton.add(closeText);

    closeButton.onMouse = (e: MouseEvent) => {
      if (e.type === "click" || e.type === "up") {
        this.hide();
      } else if (e.type === "over") {
        closeText.fg = THEME.accent;
        this.renderer.requestRender();
      } else if (e.type === "out") {
        closeText.fg = THEME.dim;
        this.renderer.requestRender();
      }
    };

    this.dialogPanel.add(closeButton);
  }

  public setOptions(options: DialogOption[]) {
    this.options = options;
    const childIds = this.optionsContainer.getChildren().map(c => c.id);
    childIds.forEach(id => this.optionsContainer.remove(id));

    options.forEach((option, index) => {
      const optionRow = new BoxRenderable(this.renderer, {
        id: `dialog-option-${index}`,
        width: "100%",
        flexDirection: "row",
        gap: 1,
        marginBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
      });

      // Title with accent color on hover (matching OpenCode's primary theme color)
      const titleText = new TextRenderable(this.renderer, {
        id: `dialog-option-title-${index}`,
        content: option.title,
        fg: THEME.accent,
        attributes: TextAttributes.BOLD,
      });

      // Description in muted color
      const descText = new TextRenderable(this.renderer, {
        id: `dialog-option-desc-${index}`,
        content: option.description || "",
        fg: THEME.dim,
      });

      optionRow.add(titleText);
      if (option.description) {
        optionRow.add(descText);
      }

      optionRow.onMouse = (e: MouseEvent) => {
        if (e.type === "click" || e.type === "up") {
          option.onSelect(this);
        } else if (e.type === "over") {
          titleText.fg = THEME.accent;
          optionRow.backgroundColor = THEME.darkAccent;
          this.renderer.requestRender();
        } else if (e.type === "out") {
          titleText.fg = THEME.accent;
          optionRow.backgroundColor = undefined;
          this.renderer.requestRender();
        }
      };

      this.optionsContainer.add(optionRow);
    });
  }

  public show(onShow?: () => void, onHide?: () => void) {
    if (this.isVisible) return;

    this.isVisible = true;
    this.onShow = onShow;
    this.onHide = onHide;
    this.overlay.visible = true;
    this.overlay.opacity = 0;

    createTimeline().add(this.overlay, {
      opacity: 1,
      duration: 300,
      ease: "outQuad",
    });

    this.onShow?.();
    this.renderer.requestRender();
  }

  public hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.overlay.visible = false;
    this.onHide?.();
    this.renderer.requestRender();
  }

  public clear() {
    this.hide();
    this.options = [];
    const childIds = this.optionsContainer.getChildren().map(c => c.id);
    childIds.forEach(id => this.optionsContainer.remove(id));
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
