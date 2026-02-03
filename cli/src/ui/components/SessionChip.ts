import {
  BoxRenderable,
  CliRenderer,
  TextRenderable,
  MouseEvent,
  createTimeline,
  Timeline,
  RGBA,
  parseColor,
  rgbToHex,
  StyledText,
  TextChunk,
} from "@opentui/core";
import { SessionData } from "../../types/tasks.js";
import { THEME } from "../theme.js";
import { formatDuration, isSessionActive } from "../../utils/index.js";

function interpolateColor(color1: string, color2: string, factor: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = c1.r + (c2.r - c1.r) * factor;
  const g = c1.g + (c2.g - c1.g) * factor;
  const b = c1.b + (c2.b - c1.b) * factor;
  const a = c1.a + (c2.a - c1.a) * factor;
  return rgbToHex(RGBA.fromValues(r, g, b, a));
}

// Colors for log-style display
const LOG_COLORS = {
  timestamp: THEME.dim,
  gitBranch: THEME.accent,
  gitAhead: THEME.green,
  gitBehind: THEME.error,
  gitModified: THEME.orange,
  path: THEME.dim,
  prompt: THEME.text,
  statusLabel: THEME.orange,
  infoLabel: THEME.blue,
  runLabel: THEME.accent,
  doneLabel: THEME.green,
  errorLabel: THEME.error,
  statusText: THEME.dim,
  runText: THEME.text,
  elapsed: THEME.dim,
};

export class SessionChip extends BoxRenderable {
  public session: SessionData;
  private headerLine: TextRenderable;
  private statusLine: TextRenderable;
  private infoLine: TextRenderable;
  private runLine: TextRenderable;
  private doneLine: TextRenderable;
  private connectorLine: TextRenderable;
  private cancelButton: TextRenderable;
  private reviewButton: TextRenderable;
  private renderer: CliRenderer;

  public isHovered = false;
  public isPressed = false;
  public isFocused = false;
  public isSelected = false;
  private visualTimeline: Timeline | null = null;
  private currentBg: string = "transparent";
  private onSelectCallback: (session: SessionData) => void;
  private onCancelCallback?: (session: SessionData) => void;
  private onReviewCallback?: (session: SessionData) => void;

  constructor(
    renderer: CliRenderer,
    session: SessionData,
    onSelect: (session: SessionData) => void,
    onCancel?: (session: SessionData) => void,
    onReview?: (session: SessionData) => void
  ) {
    super(renderer, {
      id: `session-${session.id}`,
      width: "100%",
      flexDirection: "column",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
      alignSelf: "stretch",
    });

    this.renderer = renderer;
    this.session = session;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;
    this.onReviewCallback = onReview;

    // Set up mouse handlers directly on this component
    this.onMouse = (event: MouseEvent) => {
      switch (event.type) {
        case "up":
          this.isPressed = false;
          this.updateVisuals(150);
          // Only select if the target is not the cancel or review button
          if (event.target !== this.cancelButton && event.target !== this.reviewButton) {
            this.onSelectCallback(this.session);
          }
          break;
        case "over":
          if (!this.isFocused) {
            this.isHovered = true;
            this.updateVisuals(200);
          }
          break;
        case "out":
          this.isHovered = false;
          this.updateVisuals(200);
          break;
        case "down":
          this.isPressed = true;
          this.updateVisuals(50);
          break;
      }
    };

    // Cancel button [X] - visible when session is active
    this.cancelButton = new TextRenderable(renderer, {
      id: `session-${session.id}-cancel`,
      position: "absolute",
      right: 1,
      top: 0,
      content: "[X]",
      fg: THEME.dim,
      zIndex: 100,
    });

    this.cancelButton.onMouse = (event: MouseEvent) => {
      if (event.type === "over") {
        this.cancelButton.fg = THEME.error;
        this.renderer.requestRender();
      } else if (event.type === "out") {
        this.cancelButton.fg = THEME.dim;
        this.renderer.requestRender();
      } else if (event.type === "click" || event.type === "up") {
        if (this.onCancelCallback) {
          this.onCancelCallback(this.session);
        }
      }
    };

    this.add(this.cancelButton);

    // Review button [Review] - visible when session is done with worktree
    this.reviewButton = new TextRenderable(renderer, {
      id: `session-${session.id}-review`,
      position: "absolute",
      right: 1,
      top: 0,
      content: " [Review]", // leading space to give breathing room from status text
      fg: THEME.accent,
      zIndex: 100,
      visible: false,
    });

    this.reviewButton.onMouse = (event: MouseEvent) => {
      if (event.type === "over") {
        this.reviewButton.fg = THEME.white;
        this.renderer.requestRender();
      } else if (event.type === "out") {
        this.reviewButton.fg = THEME.accent;
        this.renderer.requestRender();
      } else if (event.type === "click" || event.type === "up") {
        if (this.onReviewCallback) {
          this.onReviewCallback(this.session);
        }
      }
    };

    this.add(this.reviewButton);

    // Header line: timestamp [branch +ahead -behind ~modified] path > prompt
    this.headerLine = new TextRenderable(renderer, {
      id: `session-${session.id}-header`,
      content: this.buildHeaderContent(),
      truncate: true,
    });

    // Status line: │   [STATUS] message
    this.statusLine = new TextRenderable(renderer, {
      id: `session-${session.id}-status`,
      content: this.buildStatusContent("Ready."),
      truncate: true,
    });

    // Info line: │   [INFO] message
    this.infoLine = new TextRenderable(renderer, {
      id: `session-${session.id}-info`,
      content: this.buildInfoContent("Initializing model..."),
      truncate: true,
    });

    // Run line: │   [RUN    ] iteration info
    this.runLine = new TextRenderable(renderer, {
      id: `session-${session.id}-run`,
      content: this.buildRunContent(),
      truncate: true,
    });

    // Done line: │   └─[Done] Elapsed: XXs
    this.doneLine = new TextRenderable(renderer, {
      id: `session-${session.id}-done`,
      content: this.buildDoneContent(),
      truncate: true,
    });

    // Connector lines to next chip (two │ lines for spacing)
    this.connectorLine = new TextRenderable(renderer, {
      id: `session-${session.id}-connector`,
      content: "│\n│",
      fg: THEME.dim,
    });

    this.add(this.headerLine);
    this.add(this.statusLine);
    this.add(this.infoLine);
    this.add(this.runLine);
    this.add(this.doneLine);
    this.add(this.connectorLine);
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  private shortenPath(path?: string): string {
    if (!path) return "~/project";

    // Get the last meaningful directory name
    const segments = path.split("/").filter(s => s.length > 0);
    if (segments.length === 0) return "~/project";

    // Get last segment (project folder name)
    const lastSegment = segments[segments.length - 1];

    // If it looks like a common folder name, try to get parent too
    const commonFolders = ["src", "lib", "app", "cli", "dist", "build"];
    if (commonFolders.includes(lastSegment.toLowerCase()) && segments.length > 1) {
      return `~/${segments[segments.length - 2]}/${lastSegment}`;
    }

    return `~/project/${lastSegment}`;
  }

  private buildHeaderContent(): StyledText {
    const chunks: TextChunk[] = [];
    const gs = this.session.gitStatus;
    const time = this.formatTime(this.session.startTime);
    const path = this.shortenPath(this.session.workingDir);
    const prompt = this.session.prompt;

    // Timestamp (no prefix on header)
    chunks.push({ text: time, fg: parseColor(LOG_COLORS.timestamp), __isChunk: true });
    chunks.push({ text: " ", __isChunk: true });

    // Git status: [branch +ahead -behind ~modified]
    chunks.push({ text: "[", fg: parseColor(LOG_COLORS.gitBranch), __isChunk: true });
    chunks.push({ text: gs?.branch || "main", fg: parseColor(LOG_COLORS.gitBranch), __isChunk: true });

    if (gs) {
      if (gs.ahead > 0) {
        chunks.push({ text: " +", fg: parseColor(LOG_COLORS.gitAhead), __isChunk: true });
        chunks.push({ text: String(gs.ahead), fg: parseColor(LOG_COLORS.gitAhead), __isChunk: true });
      }
      if (gs.behind > 0) {
        chunks.push({ text: " -", fg: parseColor(LOG_COLORS.gitBehind), __isChunk: true });
        chunks.push({ text: String(gs.behind), fg: parseColor(LOG_COLORS.gitBehind), __isChunk: true });
      }
      if (gs.modified > 0) {
        chunks.push({ text: " ~", fg: parseColor(LOG_COLORS.gitModified), __isChunk: true });
        chunks.push({ text: String(gs.modified), fg: parseColor(LOG_COLORS.gitModified), __isChunk: true });
      }
    }

    chunks.push({ text: "]", fg: parseColor(LOG_COLORS.gitBranch), __isChunk: true });
    chunks.push({ text: " ", __isChunk: true });

    // Path
    chunks.push({ text: path, fg: parseColor(LOG_COLORS.path), __isChunk: true });
    chunks.push({ text: " > ", fg: parseColor(LOG_COLORS.path), __isChunk: true });

    // Prompt
    chunks.push({ text: prompt, fg: parseColor(LOG_COLORS.prompt), __isChunk: true });

    return new StyledText(chunks);
  }

  private buildStatusContent(message: string): StyledText {
    const chunks: TextChunk[] = [];
    chunks.push({ text: "│   ", fg: parseColor(THEME.dim), __isChunk: true });
    chunks.push({ text: "[STATUS] ", fg: parseColor(LOG_COLORS.statusLabel), __isChunk: true });
    chunks.push({ text: message, fg: parseColor(LOG_COLORS.statusText), __isChunk: true });
    return new StyledText(chunks);
  }

  private buildInfoContent(message: string): StyledText {
    const chunks: TextChunk[] = [];
    chunks.push({ text: "│   ", fg: parseColor(THEME.dim), __isChunk: true });
    chunks.push({ text: "[INFO] ", fg: parseColor(LOG_COLORS.infoLabel), __isChunk: true });
    chunks.push({ text: message, fg: parseColor(LOG_COLORS.statusText), __isChunk: true });
    return new StyledText(chunks);
  }

  private buildRunContent(): StyledText {
    const chunks: TextChunk[] = [];
    const iteration = this.session.iteration || 1;
    const status = this.session.status;

    // Extract step from status if available (e.g., "Iteration 1: DRAFT PRD (prd)")
    let stepInfo = `Iteration ${iteration}: DRAFT PRD`;
    if (status && !status.toLowerCase().includes("initializing") &&
        !status.toLowerCase().includes("done") &&
        !status.toLowerCase().includes("error")) {
      // Clean up the status to show just the relevant part
      stepInfo = status;
    }

    chunks.push({ text: "│   ", fg: parseColor(THEME.dim), __isChunk: true });
    chunks.push({ text: "[RUN    ] ", fg: parseColor(LOG_COLORS.runLabel), __isChunk: true });
    chunks.push({ text: stepInfo, fg: parseColor(LOG_COLORS.runText), __isChunk: true });
    return new StyledText(chunks);
  }

  private buildDoneContent(): StyledText {
    const chunks: TextChunk[] = [];
    const durationMs = Date.now() - this.session.startTime;
    const isFinished = !isSessionActive(this.session.status);
    const hasError = this.session.status.toLowerCase().includes("error");

    // Vertical line with corner: │   └─
    chunks.push({ text: "│   └─", fg: parseColor(THEME.dim), __isChunk: true });

    if (hasError) {
      chunks.push({ text: "[Error]", fg: parseColor(LOG_COLORS.errorLabel), __isChunk: true });
    } else if (isFinished) {
      chunks.push({ text: "[Done]", fg: parseColor(LOG_COLORS.doneLabel), __isChunk: true });
    } else {
      chunks.push({ text: "[...]", fg: parseColor(LOG_COLORS.elapsed), __isChunk: true });
    }

    chunks.push({ text: " Elapsed: ", fg: parseColor(LOG_COLORS.elapsed), __isChunk: true });
    chunks.push({ text: formatDuration(durationMs), fg: parseColor(LOG_COLORS.elapsed), __isChunk: true });

    return new StyledText(chunks);
  }

  private updateVisuals(duration: number = 0) {
    if (this.visualTimeline) {
      this.visualTimeline.pause();
      this.visualTimeline = null;
    }

    let targetBg = "transparent";

    // Hover: green-tinted background
    if (this.isHovered) {
      targetBg = "#0d1a0d";
    }

    // Pressed: slightly brighter green tint
    if (this.isPressed) {
      targetBg = "#1a2e1a";
    }

    if (duration === 0) {
      this.currentBg = targetBg;
      this.backgroundColor = targetBg;
      return;
    }

    const startBg = this.currentBg;

    this.visualTimeline = createTimeline({ autoplay: false });
    this.visualTimeline.add(this, {
      duration,
      onUpdate: (anim) => {
        if (startBg !== "transparent" && targetBg !== "transparent") {
          this.currentBg = interpolateColor(startBg, targetBg, anim.progress);
        } else {
          this.currentBg = anim.progress > 0.5 ? targetBg : startBg;
        }
        this.backgroundColor = this.currentBg;
      },
      onComplete: () => {
        this.currentBg = targetBg;
        this.backgroundColor = targetBg;
        this.visualTimeline = null;
      },
    });
    this.visualTimeline.play();
  }

  public focus() {
    this.isFocused = true;
    this.isHovered = false;
    this.updateVisuals(200);
  }

  public blur() {
    this.isFocused = false;
    this.updateVisuals(200);
  }

  public resetHover() {
    this.isHovered = false;
    this.updateVisuals();
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    this.updateVisuals(200);
  }

  update(session: SessionData) {
    this.session = session;

    // Update all lines
    this.headerLine.content = this.buildHeaderContent();

    // Determine status message based on session state
    const statusLower = session.status.toLowerCase();
    let statusMessage = "Ready.";
    let infoMessage = "Waiting...";

    if (session.gitStatus) {
      const gs = session.gitStatus;
      if (gs.ahead > 0 && gs.isClean) {
        statusMessage = `Branch is ahead by ${gs.ahead} commit${gs.ahead > 1 ? "s" : ""}, working tree clean.`;
      } else if (gs.ahead > 0) {
        statusMessage = `Branch is ahead by ${gs.ahead} commit${gs.ahead > 1 ? "s" : ""}, ${gs.modified} file${gs.modified > 1 ? "s" : ""} modified.`;
      } else if (gs.isClean) {
        statusMessage = "Working tree clean.";
      } else {
        statusMessage = `${gs.modified} file${gs.modified > 1 ? "s" : ""} modified.`;
      }
    }

    if (statusLower.includes("initializing")) {
      infoMessage = "Initializing model...";
    } else if (statusLower.includes("error")) {
      statusMessage = session.status.replace(/\s+/g, " ").trim();
      infoMessage = "Error occurred";
    } else if (statusLower.includes("done")) {
      infoMessage = "Task completed successfully.";
    } else {
      infoMessage = "Processing...";
    }

    this.statusLine.content = this.buildStatusContent(statusMessage);
    this.infoLine.content = this.buildInfoContent(infoMessage);
    this.runLine.content = this.buildRunContent();
    this.doneLine.content = this.buildDoneContent();

    // Update button visibility
    const completedLike = statusLower.includes("done") || statusLower.includes("task completed");
    const isFinished = !isSessionActive(session.status) || completedLike;
    const isDone = completedLike || statusLower === "done";
    const hasWorktree = !!session.worktreeInfo;

    // Show cancel button only when session is active
    this.cancelButton.visible = !isFinished;

    // Show review button when session is done and has worktree info
    this.reviewButton.visible = isDone && hasWorktree;

    // Hide cancel button if review button is shown
    if (this.reviewButton.visible) {
      this.cancelButton.visible = false;
    }
  }
}
