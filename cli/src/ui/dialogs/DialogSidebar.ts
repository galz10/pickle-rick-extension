import { DashboardDialog } from "./DashboardDialog.js";
import { Sidebar } from "./Sidebar.js";
import { SessionData } from "../tasks/types.js";
import { CliRenderer } from "@opentui/core";

export class DialogSidebar {
  private sidebar: Sidebar;
  private dashboardDialog: DashboardDialog;
  private useDialog = false;

  constructor(renderer: CliRenderer) {
    this.sidebar = new Sidebar(renderer);
    this.dashboardDialog = new DashboardDialog(renderer);
    
    // Add the dialog to the renderer root
    renderer.root.add(this.dashboardDialog.root);
  }

  public setUseDialog(use: boolean) {
    this.useDialog = use;
  }

  public update(session: SessionData, silent: boolean = false) {
    if (this.useDialog) {
      this.dashboardDialog.update(session);
      if (!silent && !this.dashboardDialog.isOpen()) {
        this.dashboardDialog.show();
      }
    } else {
      this.sidebar.update(session, silent);
    }
  }

  public show() {
    if (this.useDialog) {
      this.dashboardDialog.show();
    } else {
      this.sidebar.root.visible = true;
      this.sidebar.root.right = 0;
    }
  }

  public hide() {
    if (this.useDialog) {
      this.dashboardDialog.hide();
    } else {
      this.sidebar.hide();
    }
  }

  public isOpen(): boolean {
    if (this.useDialog) {
      return this.dashboardDialog.isOpen();
    }
    return this.sidebar.isOpen();
  }

  public showInput(placeholder?: string) {
    if (this.useDialog) {
      // Dialog doesn't support input, fall back to sidebar
      this.sidebar.showInput(placeholder);
    } else {
      this.sidebar.showInput(placeholder);
    }
  }

  public hideInput() {
    this.sidebar.hideInput();
  }

  public focusInput() {
    this.sidebar.focusInput();
  }

  public get onHide() {
    return this.sidebar.onHide;
  }

  public set onHide(callback: (() => void) | undefined) {
    this.sidebar.onHide = callback;
  }

  public get input() {
    return this.sidebar.input;
  }

  public get root() {
    return this.useDialog ? this.dashboardDialog.root : this.sidebar.root;
  }

  public get sidebarComponent() {
    return this.sidebar;
  }

  public get dialogComponent() {
    return this.dashboardDialog;
  }

  public destroy() {
    this.dashboardDialog.destroy();
  }
}