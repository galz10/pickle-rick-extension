import { BoxRenderable, CliRenderer, Renderable, TextRenderable, TextAttributes, TabSelectRenderable, InputRenderable, InputRenderableEvents, RenderableEvents, KeyEvent, RGBA, createTimeline, MouseEvent, TabSelectRenderableEvents } from "@opentui/core";
import { TabSelectOption } from "@opentui/core";
import { SessionChip } from "../components/SessionChip.js";
import { SessionData } from "../../types/tasks.js";
import { createSession, listSessions } from "../../services/config/state.js";
import { WorkerExecutorClient } from "../../services/execution/worker-client.js";
import { THEME } from "../theme.js";
import { ToyboxView } from "../views/ToyboxView.js";
import { isSessionActive } from "../../utils/index.js";
import { FilePickerView } from "../components/FilePickerView.js";
import { recursiveSearch } from "../../utils/search.js";
import { setupFilePicker, FilePickerState } from "../file-picker-utils.js";
import { sessionTracker, type TrackedSession } from "../../utils/session-tracker.js";
import { DashboardDialog } from "../dialogs/DashboardDialog.js";
import { DiffViewDialog } from "../dialogs/DiffViewDialog.js";
import { PRPreviewDialog } from "../dialogs/PRPreviewDialog.js";
import { cleanupPickleWorktree, syncWorktreeToOriginal, createPullRequest, isGhAvailable, getGitStatusInfo } from "../../services/git/index.js";
import { isGameboyActive } from "../../games/gameboy/GameboyView.js";
import { execCommand } from "../../services/providers/base.js";

export interface DashboardUI {
  tabs: TabSelectRenderable | undefined;
  separator: Renderable;
  dashboardView: BoxRenderable;
  toyboxView: Renderable;
  inputGroup: BoxRenderable;
  landingView: Renderable;
  mainContent: BoxRenderable;
  globalFooter: Renderable;
  input: InputRenderable;
  inputContainer: BoxRenderable;
  metadataLabel: TextRenderable;
  modelLabel: TextRenderable;
  footerLeft: TextRenderable;
  footerRight: TextRenderable;
}

export class DashboardController {
  private isHomeHidden = false;
  private chips: SessionChip[] = [];
  private activeExecutors = new Map<string, WorkerExecutorClient>();
  private focusedChipIndex = -1;
  private selectedChipIndex = -1;
  private selectedSession: SessionData | null = null;
  private isListFocused = false;
  private _ui?: DashboardUI;
  private toybox?: ToyboxView;
  private isInToybox = false;
  private dashboardDialog: DashboardDialog;
  private diffViewDialog: DiffViewDialog;
  private prPreviewDialog: PRPreviewDialog;

  get ui(): DashboardUI | undefined {
    return this._ui;
  }

  set ui(value: DashboardUI | undefined) {
    this._ui = value;
    if (value) {
      this.setupInputFilePicker();
      value.input?.focus();
      this.renderer.requestRender();
    }
  }

  private setupInputFilePicker() {
    if (!this.ui) return;
    const resolveBottom = (): number => {
      const height = this.ui?.inputContainer?.height;
      return typeof height === "number" ? height : 5;
    };
    setupFilePicker(this.renderer, this.ui.input, this.ui.inputContainer as BoxRenderable, this.pickerState, {
      bottom: resolveBottom,
      width: "100%",
    });
  }

  private cleanupPicker() {
    if (this.pickerState.activePicker) {
      this.pickerState.activePicker.destroy();
      this.renderer.root.remove(this.pickerState.activePicker.id);
      this.pickerState.activePicker = null;
      this.ui?.input.focus();
      this.renderer.requestRender();
    }
  }

  private ticker: ReturnType<typeof setInterval> | null = null;
  private pickerState: FilePickerState = { activePicker: null };

  constructor(
    private renderer: CliRenderer,
    private sessionContainer: BoxRenderable
  ) {
    this.dashboardDialog = new DashboardDialog(renderer);
    this.renderer.root.add(this.dashboardDialog.root);

    // Initialize diff view dialog
    this.diffViewDialog = new DiffViewDialog(renderer, {
      onMerge: async (session) => {
        await this.mergeWorktree(session);
      },
      onCreatePR: async (session) => {
        this.openPRPreview(session);
      },
      onReject: async (session) => {
        await this.rejectWorktree(session);
      },
      onClose: () => {
        // Restore focus to input when dialog closes
        this.ui?.input.focus();
      },
    });
    this.renderer.root.add(this.diffViewDialog.root);

    // Initialize PR preview dialog
    this.prPreviewDialog = new PRPreviewDialog(renderer, {
      onConfirm: async (session, title, body) => {
        await this.createPullRequest(session, title, body);
      },
      onCancel: () => {
        // Go back to diff view
        if (this.selectedSession?.worktreeInfo) {
          this.ui?.input.blur();
          this.diffViewDialog.show(this.selectedSession);
        }
      },
    });
    this.renderer.root.add(this.prPreviewDialog.root);

    this.init();
    this.setupKeyboardNav();
    this.startTicker();
  }

  public hasActivePicker(): boolean {
    return !!this.pickerState.activePicker || !!this.pickerState.justClosed;
  }

  private updateFooter() {
    if (!this.ui) return;

    if (this.isInToybox) {
      this.ui.footerLeft.content = "";
    } else {
      const dialogHint = this.ui?.input.focused ? "CTRL+S: Dialog | " : "";
      this.ui.footerLeft.content = `${dialogHint}CTRL+T: Toybox`;
    }

    // Right: Empty or Time
    this.ui.footerRight.content = new Date().toLocaleTimeString();
  }

  private startTicker() {
    this.ticker = setInterval(() => {
      if (!this.ui) return;

      this.chips.forEach(chip => {
        if (isSessionActive(chip.session.status)) {
          chip.update(chip.session);
        }
      });

      this.updateFooter();
      this.renderer.requestRender();
    }, 1000);
  }

  private async init() {
    // No history initialization needed
  }

  private addChip(session: SessionData, container: BoxRenderable, prepend: boolean = false): SessionChip {
    const chip = new SessionChip(
      this.renderer,
      session,
      (s) => this.selectSession(s),
      (s) => this.cancelSession(s),
      (s) => this.openDiffView(s)
    );
    container.add(chip);
    if (prepend) {
      this.chips.unshift(chip);
    } else {
      this.chips.push(chip);
    }
    return chip;
  }

  private cancelSession(sessionData: SessionData) {
    const executor = this.activeExecutors.get(sessionData.id);
    if (executor) {
      executor.stop();
    }
    
    sessionData.status = "CANCELLED";
    
    const chip = this.chips.find(c => c.session.id === sessionData.id);
    if (chip) {
      chip.update(sessionData);
    }

    this.activeExecutors.delete(sessionData.id);

    this.renderer.requestRender();
  }

  private setupKeyboardNav() {
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (this.hasActivePicker()) return;

      // Check if any "game" container is in renderer.root
      // This MUST happen before any other key handling to avoid leakage
      const rootChildren = this.renderer.root.getChildren();
      const hasGame = rootChildren.some(c => c.id === "snake-container" || c.id === "doom-container");
      const hasGameboy = isGameboyActive();
      
      // Show dashboard dialog with Ctrl+S - only when input is focused
      if (key.ctrl && key.name === "s") {
        if (hasGameboy || hasGame || this.isInToybox) return;

        if (this.dashboardDialog.isOpen()) {
          this.dashboardDialog.hide();
          return;
        }

        if (this.diffViewDialog.isOpen()) {
          this.diffViewDialog.hide();
          return;
        }
        // Open the last selected session if available, otherwise the most recent
        const targetSession =
          (this.selectedSession ? this.chips.find(c => c.session.id === this.selectedSession!.id)?.session : undefined) ||
          this.chips[0]?.session;

        if (targetSession) {
          this.dashboardDialog.update(targetSession);
          this.dashboardDialog.show();
        }
        return;
      }

      // If a game is active, let it handle input
      if (hasGame) return;

      if (!this.ui?.mainContent.visible) return;

      if (key.name === "escape") {
        if (this.dashboardDialog.isOpen()) {
          this.dashboardDialog.hide();
          return;
        }
      }

      if (key.name === "tab" && this.hasActivePicker()) return;

      if (!this.isListFocused || this.focusedChipIndex === -1) return;

      const chip = this.chips[this.focusedChipIndex];
      if (!chip) return;

      if (key.name === "return" || key.name === "linefeed" || key.name === "enter" || key.name === "space") {
        this.selectSession(chip.session);
      } else if (key.name === "up") {
        this.navigateChips(-1);
      } else if (key.name === "down") {
        this.navigateChips(1);
      }
    });
  }

  private selectSession(session: SessionData, silent: boolean = false) {
    const index = this.chips.findIndex(c => c.session.id === session.id);
    
    this.chips.forEach(c => c.resetHover());

    if (index !== -1) {
      if (this.selectedChipIndex !== -1 && this.selectedChipIndex !== index) {
        this.chips[this.selectedChipIndex].setSelected(false);
      }
      this.selectedChipIndex = index;
      this.chips[index].setSelected(true);

      if (this.focusedChipIndex !== -1 && this.focusedChipIndex !== index) {
        this.chips[this.focusedChipIndex].blur();
      }
      this.focusedChipIndex = index;
      this.chips[index].focus();
    }

    // Always update the selected session
    this.selectedSession = session;
    if (this.ui) {
      this.ui.metadataLabel.content = session.isPrdMode ? "Pickle PRD" : "Pickle";
    }
    
    // Update dashboard dialog
    this.dashboardDialog.update(session);
    
    // Only show dialog when not in silent mode and it's a chip click (Ctrl+S or mouse click)
    // Don't show dialog when creating a new session (silent = true)
    if (!silent) {
      this.dashboardDialog.show();
    }
    
    this.renderer.requestRender();
  }

  private navigateChips(delta: number) {
    if (this.chips.length === 0) return;

    if (this.focusedChipIndex !== -1) {
      this.chips[this.focusedChipIndex].blur();
    }

    this.focusedChipIndex += delta;
    if (this.focusedChipIndex < 0) this.focusedChipIndex = this.chips.length - 1;
    if (this.focusedChipIndex >= this.chips.length) this.focusedChipIndex = 0;

    this.chips[this.focusedChipIndex].focus();
  }

  public setListFocus(focused: boolean) {
    this.isListFocused = focused;
    if (focused) {
      if (this.focusedChipIndex === -1 && this.chips.length > 0) {
        this.focusedChipIndex = 0;
      }
      if (this.focusedChipIndex !== -1) {
        this.chips[this.focusedChipIndex].focus();
      }
    } else {
      if (this.focusedChipIndex !== -1) {
        this.chips[this.focusedChipIndex].blur();
      }
    }
  }

  public destroy() {
    this.dashboardDialog.destroy();
    this.diffViewDialog.destroy();
    this.prPreviewDialog.destroy();
  }

  public async ask(query: string): Promise<string> {
    if (!this.ui) return "n";

    return new Promise((resolve) => {
      const originalPlaceholder = this.ui!.input.placeholder;
      const originalValue = this.ui!.input.value;

      this.ui!.input.placeholder = query;
      this.ui!.input.value = "";
      this.ui!.input.focus();

      const onEnter = (value: string) => {
        this.ui!.input.removeListener(InputRenderableEvents.ENTER, onEnter);
        this.ui!.input.placeholder = originalPlaceholder;
        this.ui!.input.value = originalValue;
        resolve(value);
      };

      this.ui!.input.on(InputRenderableEvents.ENTER, onEnter);
    });
  }



  public toggleToybox() {
    if (!this.ui) return;

    if (this.isInToybox) {
      this.showDashboard();
    } else {
      this.showToybox();
    }
  }

  private showDashboard() {
    if (!this.ui) return;
    
    this.isInToybox = false;
    this.ui.dashboardView.visible = true;
    this.ui.toyboxView.visible = false;
    this.ui.inputGroup.visible = true;
    this.ui.separator.visible = false;

    if (this.toybox) {
      this.toybox.disable();
    }

    if (!this.isHomeHidden) {
      this.setHomeViewVisible(true);
    }
    
    this.ui.input.focus();
    this.updateFooter();
    this.renderer.requestRender();
  }

  private showToybox() {
    if (!this.ui) return;

    this.isInToybox = true;
    this.ui.dashboardView.visible = false;
    this.ui.toyboxView.visible = true;
    this.ui.inputGroup.visible = false;
    this.ui.separator.visible = false;

    if (!this.toybox && this.ui.toyboxView instanceof BoxRenderable) {
      this.ui.toyboxView.getChildren().forEach((child) => this.ui!.toyboxView.remove(child.id));
      this.toybox = new ToyboxView(
        this.renderer,
        this.ui.toyboxView,
        undefined,
        () => this.showDashboard()
      );
    }
    
    if (this.toybox) {
      this.toybox.enable();
    }

    this.ui.input.blur();
    this.setHomeViewVisible(false);
    this.updateFooter();
    this.renderer.requestRender();
  }

  private setHomeViewVisible(visible: boolean) {
    if (!this.ui) return;
    this.ui.separator.visible = visible;
  }

  private hideHomeView() {
    if (this.isHomeHidden || !this.ui) return;

    this.setHomeViewVisible(false);
    this.isHomeHidden = true;
  }

  public startDashboardSession(prompt: string, mode: "pickle" | "pickle-prd" = "pickle") {
    if (!this.ui) return;

    this.ui.landingView.parent?.remove(this.ui.landingView.id);
    this.ui.mainContent.visible = true;
    this.ui.globalFooter.visible = true;
    
    this.spawnSession(prompt, mode);
    
    this.ui.input.focus();
  }

  async spawnSession(prompt: string, mode: "pickle" | "pickle-prd" = "pickle") {
    if (!prompt.trim()) return;

    this.hideHomeView();

    const isPrdMode = mode === "pickle-prd";
    const cwd = process.cwd();
    const state = await createSession(cwd, prompt, isPrdMode);

    // Fetch git status for display
    const gitStatus = await getGitStatusInfo(cwd);

    if (this.ui) {
      this.ui.metadataLabel.content = isPrdMode ? "Pickle PRD" : "Pickle";
    }

    const session: SessionData = {
      id: state.session_dir,
      prompt,
      engine: "Gemini CLI",
      status: "Initializing...",
      startTime: Date.now(),
      isPrdMode: isPrdMode,
      gitStatus,
      workingDir: cwd,
      iteration: 1,
    };

    // Track this session for ToyboxSidebar
    const trackedSession: TrackedSession = {
      id: state.session_dir,
      prompt,
      createdAt: Date.now(),
      startedAt: state.started_at,
      sessionDir: state.session_dir,
    };
    sessionTracker.addSession(trackedSession);

    const chip = this.addChip(session, this.sessionContainer, true);

    this.selectSession(session, true);

    const executor = new WorkerExecutorClient();
    this.activeExecutors.set(session.id, executor);
    
    executor.onInput((q) => this.ask(q));

    executor.onProgress((report) => {
      let status = `Iteration ${report.iteration}`;
      if (report.taskTitle) status += `: ${report.taskTitle}`;
      if (report.step) status += ` (${report.step})`;

      session.status = status;
      session.iteration = report.iteration;
      chip.update(session);
      sessionTracker.updateSession(session.id, {
        status,
        iteration: report.iteration,
      });
      
      if (this.selectedSession?.id === session.id) {
        this.dashboardDialog.update(session);
      }
      this.renderer.requestRender();
    });

    executor.run(state).then((result) => {
      this.activeExecutors.delete(session.id);
      if (session.status.toLowerCase().includes("cancelled")) return;
      session.status = "Done";
      // Store worktree info if available
      if (result?.worktreeInfo) {
        session.worktreeInfo = result.worktreeInfo;
      }
      chip.update(session);
      if (this.selectedSession?.id === session.id) {
        this.dashboardDialog.update(session);
      }
    }).catch((err) => {
      this.activeExecutors.delete(session.id);
      if (session.status.toLowerCase().includes("cancelled")) return;
      session.status = `ERROR: ${err.message}`;
      chip.update(session);
      if (this.selectedSession?.id === session.id) {
        this.dashboardDialog.update(session);
      }
    });
  }

  private openDiffView(session: SessionData) {
    if (!session.worktreeInfo) return;
    // Blur the input so typing in diff view doesn't go to the prompt
    this.ui?.input.blur();
    this.diffViewDialog.show(session);
  }

  private openPRPreview(session: SessionData) {
    if (!session.worktreeInfo) return;
    this.diffViewDialog.hide();
    this.prPreviewDialog.show(session);
  }

  /**
   * Close all review dialogs and return focus to input
   */
  public closeReviewDialogs() {
    this.diffViewDialog.hide();
    this.prPreviewDialog.hide();
    this.ui?.input.focus();
  }

  private async mergeWorktree(session: SessionData) {
    if (!session.worktreeInfo || !session.workingDir) return;

    const { worktreeDir, branchName } = session.worktreeInfo;
    const originalDir = session.workingDir;

    try {
      // 1. Sync worktree changes to original directory (commit + merge)
      await syncWorktreeToOriginal(worktreeDir, originalDir, branchName);

      // 2. Clean up the worktree
      await cleanupPickleWorktree(worktreeDir, originalDir);

      // Clear worktree info after merge
      session.worktreeInfo = undefined;

      // Update chip to remove review button
      const chip = this.chips.find(c => c.session.id === session.id);
      if (chip) {
        chip.update(session);
      }

      // Hide dialog
      this.diffViewDialog.hide();

      this.renderer.requestRender();
    } catch (error) {
      console.error("Failed to merge worktree:", error);
      // Could show error dialog here
    }
  }

  private async createPullRequest(session: SessionData, title: string, body: string) {
    if (!session.worktreeInfo || !session.workingDir) return;

    const { branchName, baseBranch, worktreeDir } = session.worktreeInfo;
    const originalDir = session.workingDir;

    try {
      // Create the PR
      await createPullRequest(branchName, baseBranch, title, body);

      // Clean up worktree (don't sync since we're using PR)
      await cleanupPickleWorktree(worktreeDir, originalDir);
      
      // Clear worktree info after PR creation
      session.worktreeInfo = undefined;
      
      // Update chip to remove review button
      const chip = this.chips.find(c => c.session.id === session.id);
      if (chip) {
        chip.update(session);
      }
      
      // Hide PR dialog
      this.prPreviewDialog.hide();
      
      this.renderer.requestRender();
    } catch (error) {
      console.error("Failed to create PR:", error);
      throw error;
    }
  }

  private async rejectWorktree(session: SessionData) {
    if (!session.worktreeInfo || !session.workingDir) return;

    const { worktreeDir } = session.worktreeInfo;
    const originalDir = session.workingDir;

    try {
      await cleanupPickleWorktree(worktreeDir, originalDir);
      session.worktreeInfo = undefined;

      const chip = this.chips.find(c => c.session.id === session.id);
      if (chip) {
        chip.update(session);
      }

      this.diffViewDialog.hide();
      this.renderer.requestRender();
    } catch (error) {
      console.error("Failed to reject worktree:", error);
    }
  }
}
