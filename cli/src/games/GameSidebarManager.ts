import { CliRenderer, KeyEvent } from "@opentui/core";
import { ToyboxSidebar } from "../ui/components/ToyboxSidebar.js";

/**
 * Generic class to manage sidebar functionality for games
 * Can be reused across different games (Snake, Doom, etc.)
 */
export class GameSidebarManager {
  private sidebar?: ToyboxSidebar;
  private isEnabled = false;

  constructor(private renderer: CliRenderer) {}

  /**
   * Enable sidebar handling for a game
   * Call this when game starts
   */
  public enable(): void {
    if (this.isEnabled) return;
    this.isEnabled = true;
  }

  /**
   * Disable sidebar handling for a game
   * Call this when game ends
   */
  public disable(): void {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    this.hideSidebar();
  }

  /**
   * Handle key events for Ctrl+S toggle
   * Call this from your game's key handler
   * @returns true if key was handled, false otherwise
   */
  public handleKey(key: KeyEvent): boolean {
    if (!this.isEnabled) return false;

    // Ctrl+S for sidebar toggle
    if (key.ctrl && key.name === "s") {
      this.toggleSidebar();
      return true;
    }

    return false;
  }

  public toggleSidebar(): void {
    if (!this.sidebar) {
      this.sidebar = new ToyboxSidebar(this.renderer);
      this.renderer.root.add(this.sidebar.root);
      this.sidebar.onHide = () => {
        this.sidebar = undefined;
      };
    }

    if (this.sidebar.isOpen()) {
      this.sidebar.hide();
    } else {
      this.sidebar.show();
    }
  }

  private hideSidebar(): void {
    if (this.sidebar) {
      this.sidebar.hide();
    }
  }

  /**
   * Check if sidebar is currently open
   */
  public isOpen(): boolean {
    return this.sidebar?.isOpen() ?? false;
  }
}