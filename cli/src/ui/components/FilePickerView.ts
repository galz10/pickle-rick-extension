import {
  BoxRenderable,
  CliRenderer,
  TextRenderable,
  KeyEvent,
} from "@opentui/core";
import { THEME } from "../theme.js";

export interface FilePickerViewEvents {
  onSelect: (item: string, index: number) => void;
  onCancel?: () => void;
}

export class FilePickerView extends BoxRenderable {
  private items: string[] = [];
  private selectedIndex = 0;
  private itemRenderables: BoxRenderable[] = [];
  public events: FilePickerViewEvents;
  protected renderer: CliRenderer;

  constructor(
    renderer: CliRenderer,
    items: string[],
    events: FilePickerViewEvents,
    options: Record<string, unknown> = {}
  ) {
    super(renderer, {
      id: "file-picker",
      flexDirection: "column",
      backgroundColor: THEME.bg,
      padding: 1,
      ...options,
    });

    this.items = items;
    this.events = events;
    this.renderer = renderer;
    this.renderItems();
    this.setupKeyboard();
  }

  private renderItems() {
    // Clear existing
    this.itemRenderables.forEach((r) => this.remove(r.id));
    this.itemRenderables = [];

    // Limit to 10 items to match the high-fidelity design
    const displayItems = this.items.slice(0, 10);

    displayItems.forEach((item, i) => {
      const isSelected = i === this.selectedIndex;
      const container = new BoxRenderable(this.renderer, {
        id: `picker-item-${i}`,
        width: "100%",
        height: 1,
        backgroundColor: isSelected ? "#ffcc80" : "transparent",
        paddingLeft: 1,
        paddingRight: 1,
      });

      const text = new TextRenderable(this.renderer, {
        id: `picker-item-text-${i}`,
        content: item,
        fg: isSelected ? "#050f05" : THEME.text,
      });

      container.add(text);
      this.add(container);
      this.itemRenderables.push(container);
    });

    // Add decorative bars like the input box, matching the actual height
    const barHeight = displayItems.length;
    const barContent = "┃\n".repeat(barHeight).trimEnd();
    
    // Remove old bars if they exist
    this.remove("picker-decorative-bar-l");
    this.remove("picker-decorative-bar-r");

    if (barHeight > 0) {
      this.add(new TextRenderable(this.renderer, {
        id: "picker-decorative-bar-l",
        content: barContent,
        fg: THEME.accent,
        position: "absolute",
        left: 0,
        top: 0,
      }));
      this.add(new TextRenderable(this.renderer, {
        id: "picker-decorative-bar-r",
        content: barContent,
        fg: THEME.accent,
        position: "absolute",
        right: 0,
        top: 0,
      }));
    }
  }

  private onKey = (key: KeyEvent) => {
    if (!this.visible) return;

    if (key.name === "up") {
      this.navigate(-1);
    } else if (key.name === "down") {
      this.navigate(1);
    } else if (key.name === "return" || key.name === "enter" || key.name === "tab") {
      // Ensure we only select from the items we actually have
      const realIndex = this.selectedIndex;
      if (this.items[realIndex]) {
        this.events.onSelect(this.items[realIndex], realIndex);
      }
    } else if (key.name === "escape") {
      this.events.onCancel?.();
    }
  };

  private setupKeyboard() {
    this.renderer.keyInput.on("keypress", this.onKey);
  }

  public destroy() {
    this.renderer.keyInput.removeListener("keypress", this.onKey);
  }

  private navigate(delta: number) {
    const oldIndex = this.selectedIndex;
    const maxIndex = Math.min(this.items.length, 10) - 1;
    let newIndex = this.selectedIndex + delta;
    
    if (newIndex < 0) newIndex = maxIndex;
    if (newIndex > maxIndex) newIndex = 0;

    this.selectedIndex = newIndex;
    this.updateItemVisuals(oldIndex);
    this.updateItemVisuals(newIndex);
    this.renderer.requestRender();
  }

  private updateItemVisuals(index: number) {
    const container = this.itemRenderables[index];
    if (!container) return;

    const isSelected = index === this.selectedIndex;
    container.backgroundColor = isSelected ? "#ffcc80" : "transparent";
    
    const text = container.getChildren()[0] as TextRenderable;
    if (text) {
      text.fg = isSelected ? "#050f05" : THEME.text;
    }
  }

  public updateItems(items: string[]) {
    this.items = items;
    const maxIndex = Math.min(items.length, 10) - 1;
    this.selectedIndex = Math.min(this.selectedIndex, maxIndex);
    if (this.selectedIndex < 0 && items.length > 0) this.selectedIndex = 0;
    this.renderItems();
    this.renderer.requestRender();
  }
}
