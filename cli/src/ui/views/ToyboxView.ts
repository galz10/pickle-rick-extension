import {
  CliRenderer,
  BoxRenderable,
  TextRenderable,
  ASCIIFontRenderable,
  RGBA,
  createTimeline,
  RenderableEvents,
} from "@opentui/core";
import { THEME } from "../theme.js";
import { launchGameboy, isGameboyActive } from "../../games/gameboy/GameboyView.js";
import { launchSnake } from "../../games/snake/SnakeView.js";
import { HEADER_LINES, getLineColor } from "../common.js";
import { GameSidebarManager } from "../../games/GameSidebarManager.js";

/**
 * Interface representing a "toy" in the toybox.
 */
export interface Toy {
  id: string;
  title: string;
  description: string;
  color: string;
  onClick?: () => void;
}

/**
 * ToyboxView class representing a top-level view for Rick's inventions.
 */
export class ToyboxView {
  private keyHandler?: (key: any) => void;
  private toys: Toy[] = [];
  private cardRenderables: BoxRenderable[] = [];
  private selectedIndex = -1;
  private sidebarManager: GameSidebarManager;

  constructor(
    private renderer: CliRenderer,
    private container: BoxRenderable,
    private onSplitSnake?: () => void,
    private onBack?: () => void
  ) {
    this.sidebarManager = new GameSidebarManager(renderer);
    this.init();
  }

  private init() {
    this.container.flexDirection = "column";
    this.container.alignItems = "center";
    this.container.justifyContent = "flex-start";
    this.container.paddingTop = 1;
    this.container.backgroundColor = RGBA.fromHex(THEME.bg);

    const headerContainer = new BoxRenderable(this.renderer, {
      id: "toybox-headerContainer",
      flexDirection: "column",
      alignItems: "center",
      height: 10,
      marginBottom: 1,
    });

    HEADER_LINES.forEach((line, i) => {
      const color = getLineColor(i);
      const textRenderable = new TextRenderable(this.renderer, {
        id: `toybox-header-line-${i}`,
        content: line.trimEnd(),
        fg: color,
        flexShrink: 0,
        alignSelf: "center",
      });
      headerContainer.add(textRenderable);
    });

    const toyGrid = new BoxRenderable(this.renderer, {
      id: "toybox-grid",
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: 2,
      gap: 2,
    });

    this.populateToyGrid(toyGrid);

    // Help text at the bottom
    const helpText = new TextRenderable(this.renderer, {
      id: "toybox-help",
      content: "←→: Select | ENTER: Play | CTRL+S: Sessions | ESC: Back",
      fg: THEME.dim,
      alignSelf: "center",
      marginTop: 1,
      flexShrink: 0,
    });

    this.container.add(headerContainer);
    this.container.add(toyGrid);
    this.container.add(helpText);
  }

  public enable() {
    if (!this.keyHandler) {
      this.keyHandler = (key: any) => this.handleKey(key);
      this.renderer.keyInput.on("keypress", this.keyHandler);
      this.sidebarManager.enable();
      
      // Select first item if nothing selected
      if (this.selectedIndex === -1 && this.toys.length > 0) {
        this.selectedIndex = 0;
        this.updateSelection();
      }
    }
  }

  public disable() {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler);
      this.keyHandler = undefined;
    }
    this.sidebarManager.disable();
  }

  private handleKey(key: any) {
    // Ignore input when GameBoy is active
    if (isGameboyActive()) return;

    if (key.name === "escape") {
      if (this.onBack) this.onBack();
      return;
    }

    // Handle sidebar toggle using generic manager
    if (this.sidebarManager.handleKey(key)) {
      return;
    }

    // Tab triggers split view
    if (key.name === "tab") {
      if (this.onSplitSnake) this.onSplitSnake();
      return;
    }

    if (this.toys.length === 0) return;

    if (key.name === "right") {
      this.selectedIndex = (this.selectedIndex + 1) % this.toys.length;
      this.updateSelection();
    } else if (key.name === "left") {
      this.selectedIndex = (this.selectedIndex - 1 + this.toys.length) % this.toys.length;
      this.updateSelection();
    } else if (key.name === "return" || key.name === "enter" || key.name === "space") {
      if (this.selectedIndex !== -1 && this.toys[this.selectedIndex].onClick) {
        this.toys[this.selectedIndex].onClick!();
      }
    }
  }

  private updateSelection() {
    this.cardRenderables.forEach((card, i) => {
      const isSelected = i === this.selectedIndex;
      const toy = this.toys[i];
      const targetBorder = isSelected ? RGBA.fromHex(THEME.accent) : RGBA.fromHex(THEME.darkAccent);
      const targetBg = isSelected ? RGBA.fromHex(THEME.bg) : RGBA.fromHex(THEME.surface);

      createTimeline()
        .add(card.borderColor, {
          r: targetBorder.r,
          g: targetBorder.g,
          b: targetBorder.b,
          duration: 150,
          ease: "outQuad",
        })
        .add(card.backgroundColor, {
          r: targetBg.r,
          g: targetBg.g,
          b: targetBg.b,
          duration: 150,
          ease: "outQuad",
        });
    });
    this.renderer.requestRender();
  }

  public destroy() {
    this.disable();
  }

  private populateToyGrid(container: BoxRenderable) {
    this.toys = [
      {
        id: "gameboy",
        title: "GameBoy",
        description: "Play retro GameBoy games",
        color: THEME.blue,
        onClick: () => {
          this.disable();
          launchGameboy(this.renderer, {
            onExit: () => {
              this.enable();
              this.renderer.requestRender();
            },
            onSidebarRequest: () => this.sidebarManager.toggleSidebar(),
          });
        },
      },
      {
        id: "snake",
        title: "Snake",
        description: "Pickle Snake! Eat to grow.",
        color: THEME.accent,
        onClick: () => {
          this.disable();
          launchSnake(this.renderer, () => {
            this.enable();
            this.renderer.requestRender();
          }, {
            onSplitRequest: (paused) => {
              if (this.onSplitSnake) (this.onSplitSnake as any)(paused);
            },
            onSidebarRequest: () => this.sidebarManager.toggleSidebar(),
          });
        },
      },
    ];

    this.cardRenderables = [];
    this.toys.forEach((toy) => {
      const card = this.createToyCard(toy);
      this.cardRenderables.push(card);
      container.add(card);
    });
  }

  private createToyCard(toy: Toy): BoxRenderable {
    const card = new BoxRenderable(this.renderer, {
      id: `toy-card-${toy.id}`,
      width: 32,
      height: 14,
      border: true,
      borderColor: THEME.darkAccent,
      backgroundColor: THEME.surface,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 1,
      gap: 1,
    });

    const titleText = new ASCIIFontRenderable(this.renderer, {
      id: `toy-title-${toy.id}`,
      text: toy.title,
      font: "tiny",
      color: toy.color,
    });

    const descText = new TextRenderable(this.renderer, {
      id: `toy-desc-${toy.id}`,
      content: toy.description,
      fg: THEME.dim,
      marginTop: 1,
    });

    card.add(titleText);
    card.add(descText);

    const normalBorder = RGBA.fromHex(THEME.darkAccent);
    const hoverBorder = RGBA.fromHex(THEME.accent);
    const normalBg = RGBA.fromHex(THEME.surface);
    const hoverBg = RGBA.fromHex(THEME.bg);

    card.onMouseOver = () => {
      createTimeline()
        .add(card.borderColor, {
          r: hoverBorder.r,
          g: hoverBorder.g,
          b: hoverBorder.b,
          duration: 150,
          ease: "outQuad",
        })
        .add(card.backgroundColor, {
          r: hoverBg.r,
          g: hoverBg.g,
          b: hoverBg.b,
          duration: 150,
          ease: "outQuad",
        });
    };

    card.onMouseOut = () => {
      createTimeline()
        .add(card.borderColor, {
          r: normalBorder.r,
          g: normalBorder.g,
          b: normalBorder.b,
          duration: 200,
          ease: "outQuad",
        })
        .add(card.backgroundColor, {
          r: normalBg.r,
          g: normalBg.g,
          b: normalBg.b,
          duration: 200,
          ease: "outQuad",
        });
    };

    if (toy.onClick) {
      const originalOnMouse = card.onMouse;
      card.onMouse = (event: any) => {
        if (event.type === "click" || event.type === "up") {
          toy.onClick!();
        }
        if (originalOnMouse) {
          originalOnMouse(event);
        }
      };
    }

    return card;
  }
}