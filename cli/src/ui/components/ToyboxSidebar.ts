import {
  BoxRenderable,
  MouseEvent,
  CliRenderer,
  TextRenderable,
  TextAttributes,
  ScrollBoxRenderable,
  createTimeline,
} from "@opentui/core";
import { THEME } from "../theme.js";
import { formatDuration } from "../../utils/index.js";
import { launchSnake } from "../../games/snake/SnakeView.js";
import { sessionTracker, type TrackedSession } from "../../utils/session-tracker.js";
import { loadState } from "../../services/config/state.js";

export class ToyboxSidebar {
  public root: BoxRenderable;
  private content: ScrollBoxRenderable;
  private renderer: CliRenderer;
  private isVisible = false;
  public onHide?: () => void;
  private ticker: ReturnType<typeof setInterval> | null = null;

  private titleText: TextRenderable;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;
    this.root = new BoxRenderable(renderer, {
      id: "toybox-sidebar-root",
      width: 45,
      height: "100%",
      position: "absolute",
      right: -45, // Start off-screen
      flexDirection: "column",
      backgroundColor: THEME.bg,
      visible: false,
      zIndex: 25000,
      border: ["left"],
      borderColor: THEME.darkAccent,
    });

    this.content = new ScrollBoxRenderable(renderer, {
      id: "toybox-sidebar-content",
      width: "100%",
      flexGrow: 1,
      scrollY: true,
      scrollX: false,
      scrollbarOptions: {
        trackOptions: {
          backgroundColor: THEME.darkAccent,
          foregroundColor: THEME.accent,
        },
      },
    });

    // Header
    const header = new BoxRenderable(renderer, {
      id: "toybox-sidebar-header",
      width: "100%",
      height: 3,
      flexDirection: "column",
      justifyContent: "center",
      paddingLeft: 2,
      paddingRight: 2,
      border: ["bottom"],
      borderColor: THEME.darkAccent,
      flexShrink: 0,
    });

    this.titleText = new TextRenderable(renderer, {
      id: "toybox-sidebar-title",
      content: "Sessions",
      fg: THEME.accent,
      attributes: TextAttributes.BOLD,
      fontSize: 1,
    });

    header.add(this.titleText);

    this.root.add(header);
    this.root.add(this.content);

    this.setupMouseHandlers();
  }

  private setupMouseHandlers() {
    this.root.onMouse = (event: MouseEvent) => {
      if (event.type === "click") {
        // Allow clicking through to content
        return;
      }
    };
  }

  public async show() {
    if (this.isVisible) return;
    
    this.isVisible = true;
    this.root.visible = true;
    
    // Animate in
    createTimeline().add(this.root, {
      right: 0,
      duration: 200,
      ease: "outQuad",
      onUpdate: () => this.renderer.requestRender(),
    });

    await this.refreshContent();
    this.startTicker();
  }

  public hide() {
    if (!this.isVisible) return;

    this.stopTicker();

    // Animate out
    createTimeline().add(this.root, {
      right: -45,
      duration: 200,
      ease: "inQuad",
      onUpdate: () => this.renderer.requestRender(),
      onComplete: () => {
        this.isVisible = false;
        this.root.visible = false;
        this.onHide?.();
      },
    });
  }

  public destroy() {
    this.stopTicker();
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  private async refreshContent() {
    // Clear all children - collect IDs first, then remove in reverse order
    const children = this.content.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      this.content.remove(children[i].id);
    }

    // Add sessions section
    await this.addSessionsSection();

    this.renderer.requestRender();
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(async () => {
      if (!this.isVisible) return;
      try {
        await this.refreshContent();
      } catch (e) {
        // Silently ignore refresh errors
      }
    }, 2000);
  }

  private stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private async addSessionsSection() {
    try {
      // Get tracked sessions (created from this UI instance)
      const trackedSessions = sessionTracker.getTrackedSessions();
      
      if (trackedSessions.length === 0) {
        const emptyState = new TextRenderable(this.renderer, {
          id: "empty-sessions",
          content: "No active sessions",
          fg: THEME.dim,
          alignSelf: "center",
          marginTop: 1,
        });
        this.content.add(emptyState);
        return;
      }

      // Get current status for each tracked session
      const sessionsWithStatus = await Promise.all(
        trackedSessions.map(async (trackedSession) => {
          const state = await loadState(trackedSession.sessionDir);
          // Always prefer fresh state from disk over cached status
          const status = state && state.active && state.step !== "done"
            ? `${state.step.toUpperCase()} (Iteration ${state.iteration})`
            : state?.step === "done"
              ? "Done"
              : trackedSession.status ?? "Starting...";
          const iteration = state?.iteration ?? trackedSession.iteration ?? 0;

          return {
            ...trackedSession,
            status,
            iteration,
          };
        })
      );

      // Create session cards
      for (let i = 0; i < sessionsWithStatus.length; i++) {
        const session = sessionsWithStatus[i];
        const sessionCard = this.createSessionCard(session, i);
        this.content.add(sessionCard);
      }

    } catch (error) {
      const errorText = new TextRenderable(this.renderer, {
        id: "error-text",
        content: "Failed to load sessions",
        fg: "#ff6b6b",
        alignSelf: "center",
        marginTop: 2,
      });
      this.content.add(errorText);
    }
  }

  private createSessionCard(session: TrackedSession & { status: string }, index: number): BoxRenderable {
    const shortId = session.id.substring(0, 8);
    const cardId = `${index}-${shortId}`;

    const card = new BoxRenderable(this.renderer, {
      id: `session-card-${cardId}`,
      width: "100%",
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      border: ["bottom"],
      borderColor: THEME.darkAccent,
    });

    // Status indicator and title
    const statusRow = new BoxRenderable(this.renderer, {
      id: `status-row-${cardId}`,
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 1,
    });

    const isActive = session.status.toLowerCase() !== "done";
    const statusColor = isActive ? THEME.green : THEME.accent;
    
    const statusIndicator = new TextRenderable(this.renderer, {
      id: `status-indicator-${cardId}`,
      content: isActive ? "🟢" : "✅",
      fg: statusColor,
    });

    const statusText = new TextRenderable(this.renderer, {
      id: `status-text-${cardId}`,
      content: session.status.toUpperCase(),
      fg: statusColor,
      attributes: TextAttributes.BOLD,
      fontSize: 1,
    });

    statusRow.add(statusIndicator);
    statusRow.add(statusText);

    // Session prompt (truncated)
    const promptText = session.prompt.length > 50 
      ? session.prompt.substring(0, 47) + "..."
      : session.prompt;
    
    const promptRenderable = new TextRenderable(this.renderer, {
      id: `prompt-${cardId}`,
      content: promptText,
      fg: THEME.text,
      marginBottom: 1,
      fontSize: 1,
    });

    // Session metadata
    const metaRow = new BoxRenderable(this.renderer, {
      id: `meta-row-${cardId}`,
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
    });

    const timeAgo = formatDuration(Date.now() - session.createdAt);
    
    const timeText = new TextRenderable(this.renderer, {
      id: `time-${cardId}`,
      content: `Started ${timeAgo} ago`,
      fg: THEME.dim,
      fontSize: 1,
    });

    const sessionIdText = new TextRenderable(this.renderer, {
      id: `session-id-${cardId}`,
      content: shortId,
      fg: THEME.darkAccent,
    });

    metaRow.add(timeText);
    metaRow.add(sessionIdText);

    card.add(statusRow);
    card.add(promptRenderable);
    card.add(metaRow);

    // Add hover effect
    card.onMouse = (event: MouseEvent) => {
      switch (event.type) {
        case "over":
          card.backgroundColor = "#2d372d";
          break;
        case "out":
          card.backgroundColor = THEME.bg;
          break;
      }
    };

    return card;
  }
}
