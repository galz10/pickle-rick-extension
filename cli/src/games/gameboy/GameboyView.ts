/**
 * GameboyView - A wrapper around opentui-gameboy that adds app-specific UI
 */
import {
  CliRenderer,
  BoxRenderable,
  RGBA,
  KeyEvent,
} from "@opentui/core";
import { join } from "node:path";
import { homedir } from "node:os";
import { 
  launchGameboy as launchGameboyCore, 
  isGameboyActive as isGameboyActiveCore, 
  type GameboyOptions, 
  type Keybinding 
} from "opentui-gameboy";
import { THEME } from "../../ui/theme.js";
import { logError } from "../../ui/logger.js";

// Re-export safe wrapper
export function isGameboyActive(): boolean {
  try {
    return isGameboyActiveCore();
  } catch (e) {
    logError(`Gameboy binding error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export interface GameboyViewOptions {
  onExit: () => void;
  onSidebarRequest?: () => void;
}

/**
 * Launch the GameBoy emulator with a black background overlay
 */
export function launchGameboy(renderer: CliRenderer, options: GameboyViewOptions): void {
  const { onExit, onSidebarRequest } = options;

  // Set up Ctrl+S handler for sidebar toggle (app-specific behavior)
  const sidebarKeyHandler = (key: KeyEvent) => {
    if (key.ctrl && key.name === "s" && onSidebarRequest) {
      onSidebarRequest();
    }
  };
  renderer.keyInput.on("keypress", sidebarKeyHandler);

  // Define save/load keybindings (S and L without Ctrl)
  const saveKeybinding: Keybinding = { key: "s" };
  const loadKeybinding: Keybinding = { key: "l" };

  try {
    // Launch the gameboy from the library
    launchGameboyCore(renderer, {
      romDirectory: join(homedir(), ".pickle", "emulator"),
      saveDirectory: join(homedir(), ".pickle", "emulator", "saves"),
      logFile: join(homedir(), ".pickle", "gameboy.log"),
      theme: {
        bg: THEME.bg,
        text: THEME.text,
        accent: THEME.accent,
        dim: THEME.dim,
        darkAccent: THEME.darkAccent,
        surface: THEME.surface,
      },
      debug: true,
      saveKeybinding,
      loadKeybinding,
      onExit: () => {
        // Remove sidebar key handler
        renderer.keyInput.off("keypress", sidebarKeyHandler);

        // Remove background overlay when exiting
        try {
          renderer.root.remove("gameboy-background");
        } catch (e) {
          // Ignore if already removed
        }
        onExit();
      },
      onForceExit: () => {
        renderer.destroy();
        process.exit(0);
      },
    });
  } catch (e) {
    logError(`Failed to launch Gameboy: ${e instanceof Error ? e.message : String(e)}`);
    
    // Cleanup on failure
    renderer.keyInput.off("keypress", sidebarKeyHandler);
    try {
      renderer.root.remove("gameboy-background");
    } catch (err) {}
    
    // Notify caller that we "exited" (failed)
    onExit();
  }
}
