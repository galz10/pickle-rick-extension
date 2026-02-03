import {
  TextRenderable,
  TextAttributes,
  ScrollBoxRenderable,
  BoxRenderable,
  CliRenderer,
} from "@opentui/core";
import { THEME } from "../theme.js";
import { Dialog } from "./Dialog.js";
import { SessionData } from "../../types/tasks.js";
import { LogView } from "../views/LogView.js";
import { formatDuration, Clipboard } from "../../utils/index.js";
import { readFile } from "node:fs/promises";

export class DashboardDialog {
  private dialog: Dialog;
  private renderer: CliRenderer;
  private session: SessionData | null = null;
  private logView: LogView | null = null;
  private currentSessionId: string | null = null;
  
  private promptText!: TextRenderable;
  private timeText!: TextRenderable;
  private statusText!: TextRenderable;
  private sessionMetaText!: TextRenderable;
  private logContainer!: BoxRenderable;
  private logScrollContainer!: BoxRenderable;
  private logHeaderRight!: TextRenderable;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;
    this.dialog = new Dialog(renderer, "Session Dashboard");
    
    this.setupContent();
    
    // Initialize with a message to ensure content is visible
    this.promptText.content = "No session selected";
    this.timeText.content = "--:--s";
    this.statusText.content = "Idle";
    this.statusText.fg = THEME.dim;
    this.sessionMetaText.content = "";
  }

  private setupContent() {
    const childIds = this.dialog.content.getChildren().map(c => c.id);
    childIds.forEach(id => this.dialog.content.remove(id));

    const sessionCard = new BoxRenderable(this.renderer, {
      id: "dashboard-session-card",
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
      backgroundColor: THEME.surface,
      border: true,
      borderColor: THEME.darkAccent,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 2,
      gap: 1,
    });

    const headerRow = new BoxRenderable(this.renderer, {
      id: "dashboard-session-header",
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 1,
    });

    const headerTitle = new TextRenderable(this.renderer, {
      id: "dashboard-session-title",
      content: "Session",
      fg: THEME.accent,
      attributes: TextAttributes.BOLD,
    });
    headerRow.add(headerTitle);

    this.sessionMetaText = new TextRenderable(this.renderer, {
      id: "dashboard-session-meta",
      content: "",
      fg: THEME.dim,
      wrapMode: "word",
    });
    headerRow.add(this.sessionMetaText);

    sessionCard.add(headerRow);

    const promptLabel = new TextRenderable(this.renderer, {
      id: "dashboard-prompt-label",
      content: "Prompt",
      fg: THEME.dim,
      attributes: TextAttributes.BOLD,
      marginBottom: 0,
    });
    sessionCard.add(promptLabel);

    this.promptText = new TextRenderable(this.renderer, {
      id: "dashboard-prompt",
      content: "No session selected",
      fg: THEME.white,
      marginBottom: 1,
      width: "100%",
      wrapMode: "word",
    });
    sessionCard.add(this.promptText);

    // Status and elapsed on separate lines for consistent alignment
    const statusRow = new BoxRenderable(this.renderer, {
      id: "dashboard-status-row",
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      marginBottom: 1,
    });

    const statusLabel = new TextRenderable(this.renderer, {
      id: "dashboard-status-label",
      content: "Status:",
      fg: THEME.dim,
    });
    statusRow.add(statusLabel);

    const statusPill = new BoxRenderable(this.renderer, {
      id: "dashboard-status-pill",
      backgroundColor: THEME.darkAccent,
      paddingLeft: 1,
      paddingRight: 1,
      flexShrink: 0,
      maxWidth: "80%",
    });
    this.statusText = new TextRenderable(this.renderer, {
      id: "dashboard-status-text",
      content: "",
      fg: THEME.accent,
      attributes: TextAttributes.BOLD,
      wrapMode: "none",
      truncate: true,
      width: 32,
    });
    statusPill.add(this.statusText);
    statusRow.add(statusPill);
    sessionCard.add(statusRow);

    const timeRow = new BoxRenderable(this.renderer, {
      id: "dashboard-time-row",
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
    });

    const timeLabel = new TextRenderable(this.renderer, {
      id: "dashboard-time-label",
      content: "Elapsed:",
      fg: THEME.dim,
    });
    timeRow.add(timeLabel);

    this.timeText = new TextRenderable(this.renderer, {
      id: "dashboard-time",
      content: "",
      fg: THEME.text,
      wrapMode: "none",
      truncate: true,
    });
    timeRow.add(this.timeText);

    sessionCard.add(timeRow);

    this.dialog.content.add(sessionCard);

    this.logContainer = new BoxRenderable(this.renderer, {
      id: "dashboard-log-container",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: THEME.surface,
      border: true,
      borderColor: THEME.darkAccent,
      marginTop: 1,
    });

    const logHeaderBar = new BoxRenderable(this.renderer, {
      id: "dashboard-log-header",
      width: "100%",
      height: 2,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 1,
      paddingRight: 1,
      backgroundColor: THEME.surface,
      border: ["bottom"],
      borderColor: THEME.darkAccent,
      flexShrink: 0,
    });

    const logHeaderTitle = new TextRenderable(this.renderer, {
      id: "dashboard-log-title",
      content: "Log Output",
      fg: THEME.accent,
      attributes: TextAttributes.BOLD,
    });
    logHeaderBar.add(logHeaderTitle);

    this.logHeaderRight = new TextRenderable(this.renderer, {
      id: "dashboard-log-meta",
      content: "auto-follow",
      fg: THEME.dim,
    });
    logHeaderBar.add(this.logHeaderRight);

    this.logContainer.add(logHeaderBar);

    this.logScrollContainer = new BoxRenderable(this.renderer, {
      id: "dashboard-log-scroll",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: THEME.bg,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      overflow: "hidden", // explicitly hide scrollbars
    });
    this.logContainer.add(this.logScrollContainer);

    this.dialog.content.add(this.logContainer);

    this.dialog.setOptions([
      {
        title: "Copy",
        value: "dialog.copy",
        description: "logs to clipboard",
        onSelect: async (dialog) => {
          if (this.session) {
            try {
              const logContent = await this.getLogContent();
              await Clipboard.copy(logContent);
              this.logHeaderRight.content = "copied ✓";
              setTimeout(() => {
                if (this.session) {
                  this.logHeaderRight.content = `session ${this.formatSessionId(this.session.id)}`;
                  this.renderer.requestRender();
                }
              }, 1500);
            } catch (error) {
              console.error("Failed to copy logs:", error);
              this.logHeaderRight.content = "copy failed";
              setTimeout(() => {
                if (this.session) {
                  this.logHeaderRight.content = `session ${this.formatSessionId(this.session.id)}`;
                  this.renderer.requestRender();
                }
              }, 2000);
            }
          }
          this.renderer.requestRender();
        },
      },
    ]);
  }

  public update(session: SessionData) {
    this.session = session;
    this.startTicker();
    this.refresh();
  }

  private refresh() {
    if (!this.session) return;

    this.promptText.content = this.session.prompt;
    const durationMs = Date.now() - this.session.startTime;
    this.timeText.content = formatDuration(durationMs);
    this.statusText.content = this.formatStatusLabel(this.session.status);
    this.statusText.fg = this.getStatusColor(this.session.status);

    const sessionId = this.formatSessionId(this.session.id);
    const mode = this.session.isPrdMode ? "PRD" : "Run";
    this.sessionMetaText.content = `${this.session.engine} • ${mode} • ${sessionId}`;
    this.logHeaderRight.content = sessionId ? `session ${sessionId}` : "auto-follow";

    // Always rebuild log view on update to avoid stale tails and ensure fresh content
    if (this.logView) {
      const existing = this.logScrollContainer?.getChildren() || [];
      existing.forEach(child => this.logScrollContainer?.remove(child.id));
      this.logView.destroy();
      this.logView = null;
    }
    
    this.logView = new LogView(this.renderer, `${this.session.id}/session.log`, () => {
      this.renderer.requestRender();
    });
    
    if (this.logScrollContainer) {
      this.logScrollContainer.add(this.logView.root);
    }
    this.currentSessionId = this.session.id;

    this.renderer.requestRender();
  }

  private formatSessionId(sessionId: string): string {
    const segments = sessionId.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? sessionId;
  }

  private formatStatusLabel(status: string): string {
    const trimmed = status?.trim() || "Initializing";
    if (trimmed.length <= 32) return trimmed;
    return `${trimmed.slice(0, 29)}...`;
  }

  private getStatusColor(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized.includes("error") || normalized.includes("failed")) return "#ff5252";
    if (normalized.includes("cancelled") || normalized.includes("canceled")) return "#ff5252";
    if (normalized.includes("done") || normalized.includes("success")) return THEME.green;
    if (normalized.includes("iteration") || normalized.includes("running")) return THEME.accent;
    return THEME.text;
  }

  private async getLogContent(): Promise<string> {
    if (!this.session) return "";
    
    try {
      const logPath = `${this.session.id}/session.log`;
      console.log("Attempting to read log file:", logPath);
      const content = await readFile(logPath, "utf-8");
      console.log("Successfully read log file, length:", content.length);
      return content;
    } catch (error) {
      console.error("Failed to read log file:", error);
      return `Failed to read log content: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  public show() {
    if (this.session) {
      this.refresh();
    }
    this.dialog.show();
  }

  public hide() {
    this.dialog.hide();
    this.session = null;
    this.currentSessionId = null;
    this.stopTicker();
    if (this.logView) {
      const existing = this.logScrollContainer?.getChildren() || [];
      existing.forEach(child => this.logScrollContainer?.remove(child.id));
      this.logView.destroy();
      this.logView = null;
    }
  }

  public isOpen(): boolean {
    return this.dialog.isOpen();
  }

  public get root() {
    return this.dialog.root;
  }

  public destroy() {
    this.stopTicker();
    if (this.logView) {
      this.logView.destroy();
    }
    if (this.logScrollContainer) {
      const children = this.logScrollContainer.getChildren();
      children.forEach(child => this.logScrollContainer.remove(child.id));
    }
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (!this.session) return;
      const durationMs = Date.now() - this.session.startTime;
      this.timeText.content = formatDuration(durationMs);
      this.renderer.requestRender();
    }, 1000);
  }

  private stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}
