import {
  BoxRenderable,
  CliRenderer,
  RGBA,
  TextRenderable,
  TextAttributes,
  KeyEvent,
} from "@opentui/core";
import { SnakeGame, Direction } from "./SnakeGame.js";
import { THEME } from "../../ui/theme.js";

export interface SnakeOptions {
  width?: number | "auto" | `${number}%`;
  height?: number | "auto" | `${number}%`;
  left?: number | "auto" | `${number}%`;
  top?: number | "auto" | `${number}%`;
  zIndex?: number;
  startPaused?: boolean;
  onSplitRequest?: (paused: boolean) => void;
  onSidebarRequest?: () => void;
}

export async function launchSnake(
  renderer: CliRenderer,
  onExit: () => void,
  options: SnakeOptions = {}
) {
  const container = new BoxRenderable(renderer, {
    id: "snake-container",
    width: options.width ?? "100%",
    height: options.height ?? "100%",
    position: "absolute",
    left: options.left ?? 0,
    top: options.top ?? 0,
    zIndex: options.zIndex ?? 24000, // Below sidebar (25000)
    backgroundColor: RGBA.fromHex(THEME.bg),
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    border: options.width && !options.height ? ["left"] : options.height && !options.width ? ["bottom"] : undefined,
    borderColor: THEME.darkAccent,
  });
  renderer.root.add(container);

  // Calculate actual available dimensions
  const parseSize = (size: number | string | "auto" | undefined, terminalSize: number): number => {
    if (typeof size === "number") return size;
    if (typeof size === "string" && size.endsWith("%")) {
      const pct = parseFloat(size) / 100;
      return Math.floor(terminalSize * pct);
    }
    return terminalSize;
  };

  const termWidth = parseSize(options.width, renderer.terminalWidth) || 80;
  const termHeight = parseSize(options.height, renderer.terminalHeight) || 24;

  // Scale game board to fit available space
  const availableHeight = termHeight - 6;
  // Increase width ratio to compensate for character aspect ratio (approx 1:2)
  const gameWidth = Math.max(20, Math.min(80, Math.floor(termWidth * 0.7)));
  const gameHeight = Math.max(10, Math.min(availableHeight, Math.floor(availableHeight * 0.75)));
  
  let game: SnakeGame;
  try {
    game = new SnakeGame(gameWidth, gameHeight);
  } catch (e) {
    const errorDisplay = new TextRenderable(renderer, {
      id: "snake-error",
      content: e instanceof Error ? e.message : String(e),
      fg: RGBA.fromInts(255, 50, 50, 255),
      attributes: TextAttributes.BOLD,
    });
    container.add(errorDisplay);
    renderer.requestRender();
    setTimeout(() => {
      renderer.root.remove(container.id);
      onExit();
      renderer.requestRender();
    }, 3000);
    return;
  }

  const board = new BoxRenderable(renderer, {
    id: "snake-board",
    width: gameWidth + 2,
    height: gameHeight + 2,
    border: true,
    borderColor: THEME.accent, // Brighter border
    backgroundColor: THEME.surface,
    position: "relative",
    marginBottom: 1,
  });
  container.add(board);

  const statsRow = new BoxRenderable(renderer, {
    id: "snake-stats",
    width: gameWidth + 2,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1,
  });

  const scoreText = new TextRenderable(renderer, {
    id: "snake-score",
    content: "Score: 0",
    fg: THEME.accent,
    attributes: TextAttributes.BOLD,
  });
  statsRow.add(scoreText);
  container.add(statsRow);

  const helpText = new TextRenderable(renderer, {
    id: "snake-help",
    content: "WASD: Move | P: Pause | CTRL+S: Sessions | ESC: Quit",
    fg: THEME.dim,
  });
  container.add(helpText);

  let isExiting = false;
  let isPaused = options.startPaused ?? false;
  let gameInterval: NodeJS.Timeout | null = null;

  const startGameLoop = () => {
    if (gameInterval || isPaused) return;
    gameInterval = setInterval(() => {
      game.update();
      renderGame();
    }, 120); // Slightly faster for better feel
  };

  const stopGameLoop = () => {
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
  };

  const cleanup = () => {
    if (isExiting) return;
    isExiting = true;
    stopGameLoop();
    renderer.keyInput.off("keypress", inputHandler);
    renderer.root.remove(container.id);
    onExit();
    renderer.requestRender();
  };

  const inputHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      cleanup();
      return;
    }

    if (key.ctrl && key.name === "s" && options.onSidebarRequest) {
      options.onSidebarRequest();
      renderer.requestRender();
      return true;
    }

    if (game.getGameOver()) {
      if (key.name === "r") {
        game = new SnakeGame(gameWidth, gameHeight);
        isPaused = false;
        renderGame();
        startGameLoop();
      }
      return;
    }

    if (key.name === "p" || key.name === "space") {
      isPaused = !isPaused;
      if (isPaused) {
        stopGameLoop();
        renderGame();
      } else {
        startGameLoop();
      }
      return;
    }

    if (isPaused && key.name === "_" && options.onSplitRequest) {
      cleanup();
      options.onSplitRequest(isPaused);
      return;
    }

    if (isPaused) return;

    switch (key.name) {
      case "w":
      case "up":
        game.setDirection(Direction.UP);
        break;
      case "s":
      case "down":
        game.setDirection(Direction.DOWN);
        break;
      case "a":
      case "left":
        game.setDirection(Direction.LEFT);
        break;
      case "d":
      case "right":
        game.setDirection(Direction.RIGHT);
        break;
    }
  };

  renderer.keyInput.on("keypress", inputHandler);

  const renderGame = () => {
    const children = board.getChildren();
    for (const child of children) {
      if (child.id.startsWith("snake-") || child.id === "food" || child.id === "overlay") {
        board.remove(child.id);
      }
    }

    const food = game.getFood();
    board.add(
      new TextRenderable(renderer, {
        id: "food",
        content: "◆",
        fg: THEME.error,
        position: "absolute",
        left: food.x,
        top: food.y,
        zIndex: 10,
      })
    );

    game.getSnake().forEach((p, i) => {
      board.add(
        new TextRenderable(renderer, {
          id: `snake-${i}`,
          content: i === 0 ? "█" : "▒",
          fg: THEME.accent,
          position: "absolute",
          left: p.x,
          top: p.y,
          zIndex: 20,
        })
      );
    });

    scoreText.content = `Score: ${game.getScore()}`;

    if (isPaused || game.getGameOver()) {
      const msg = game.getGameOver() ? " GAME OVER " : " PAUSED ";
      const subMsg = game.getGameOver() ? " [R]estart | [ESC] Quit " : "";
      
      const overlay = new BoxRenderable(renderer, {
        id: "overlay",
        width: "100%",
        height: "100%",
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 100,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        backgroundColor: RGBA.fromInts(0, 0, 0, 180),
      });

      overlay.add(new TextRenderable(renderer, {
        id: "overlay-msg",
        content: msg,
        fg: THEME.white,
        attributes: TextAttributes.BOLD,
      }));

      if (subMsg) {
        overlay.add(new TextRenderable(renderer, {
          id: "overlay-sub",
          content: subMsg,
          fg: THEME.dim,
        }));
      }

      board.add(overlay);
    }

    renderer.requestRender();
  };

  startGameLoop();
  renderGame();
}
