import {
	BoxRenderable,
	TextRenderable,
	TextAttributes,
	ScrollBoxRenderable,
	CliRenderer,
	KeyEvent,
	InputRenderable,
	MarkdownRenderable,
} from "@opentui/core";
import { THEME } from "../theme.js";
import type { SessionData } from "../../types/tasks.js";
import { generatePRDescription, type PRDescription } from "../../services/git/index.js";

export interface PRPreviewDialogEvents {
	onConfirm: (session: SessionData, title: string, body: string) => Promise<void>;
	onCancel: () => void;
}

export class PRPreviewDialog {
	public root: BoxRenderable;
	private renderer: CliRenderer;
	private isVisible = false;
	private session: SessionData | null = null;
	private events: PRPreviewDialogEvents;
	private keyHandler: ((key: KeyEvent) => void) | null = null;

	// UI Elements
	private overlay: BoxRenderable;
	private mainPanel: BoxRenderable;
	private headerBar: BoxRenderable;
	private titleText: TextRenderable;
	private contentArea: BoxRenderable;
	private titleInput: InputRenderable;
	private bodyScrollContainer: ScrollBoxRenderable;
	private bodyPreview: MarkdownRenderable;
	private footerBar: BoxRenderable;
	private statusText: TextRenderable;

	// State
	private prTitle: string = "";
	private prBody: string = "";
	private isEditingTitle = false;
	private isLoading = false;

	constructor(renderer: CliRenderer, events: PRPreviewDialogEvents) {
		this.renderer = renderer;
		this.events = events;

		// Background overlay
		this.overlay = new BoxRenderable(renderer, {
			id: "pr-preview-overlay",
			width: "100%",
			height: "100%",
			position: "absolute",
			left: 0,
			top: 0,
			backgroundColor: THEME.bg,
			visible: false,
			zIndex: 31000,
			flexDirection: "column",
		});

		// Main panel
		this.mainPanel = new BoxRenderable(renderer, {
			id: "pr-preview-main",
			width: "100%",
			height: "100%",
			flexDirection: "column",
			padding: 2,
		});
		this.overlay.add(this.mainPanel);

		// Header bar
		this.headerBar = new BoxRenderable(renderer, {
			id: "pr-preview-header",
			width: "100%",
			height: 3,
			flexDirection: "row",
			alignItems: "center",
			marginBottom: 1,
			flexShrink: 0,
		});
		this.mainPanel.add(this.headerBar);

		this.titleText = new TextRenderable(renderer, {
			id: "pr-preview-title",
			content: "Create Pull Request",
			fg: THEME.accent,
			attributes: TextAttributes.BOLD,
		});
		this.headerBar.add(this.titleText);

		// Content area
		this.contentArea = new BoxRenderable(renderer, {
			id: "pr-preview-content",
			width: "100%",
			flexGrow: 1,
			flexDirection: "column",
		});
		this.mainPanel.add(this.contentArea);

		// Title section
		const titleSection = new BoxRenderable(renderer, {
			id: "pr-preview-title-section",
			width: "100%",
			flexDirection: "column",
			marginBottom: 2,
			flexShrink: 0,
		});
		this.contentArea.add(titleSection);

		const titleLabel = new TextRenderable(renderer, {
			id: "pr-preview-title-label",
			content: "Title:",
			fg: THEME.white,
			attributes: TextAttributes.BOLD,
			marginBottom: 1,
		});
		titleSection.add(titleLabel);

		this.titleInput = new InputRenderable(renderer, {
			id: "pr-preview-title-input",
			width: "100%",
			height: 3,
			placeholder: "Enter PR title...",
			backgroundColor: THEME.surface,
			cursorColor: THEME.accent,
			textColor: THEME.text,
			placeholderColor: THEME.dim,
			border: true,
			borderColor: THEME.darkAccent,
		});
		titleSection.add(this.titleInput);

		// Body section
		const bodySection = new BoxRenderable(renderer, {
			id: "pr-preview-body-section",
			width: "100%",
			flexGrow: 1,
			flexDirection: "column",
		});
		this.contentArea.add(bodySection);

		const bodyLabel = new TextRenderable(renderer, {
			id: "pr-preview-body-label",
			content: "Description (Preview):",
			fg: THEME.white,
			attributes: TextAttributes.BOLD,
			marginBottom: 1,
		});
		bodySection.add(bodyLabel);

		this.bodyScrollContainer = new ScrollBoxRenderable(renderer, {
			id: "pr-preview-body-scroll",
			width: "100%",
			flexGrow: 1,
			scrollY: true,
			backgroundColor: THEME.surface,
			border: true,
			borderColor: THEME.darkAccent,
			contentOptions: {
				padding: 1,
			},
		});
		bodySection.add(this.bodyScrollContainer);

		this.bodyPreview = new MarkdownRenderable(renderer, {
			id: "pr-preview-body-content",
			content: "",
			fg: THEME.text,
			width: "100%",
		});
		this.bodyScrollContainer.add(this.bodyPreview);

		// Footer bar
		this.footerBar = new BoxRenderable(renderer, {
			id: "pr-preview-footer",
			width: "100%",
			height: 3,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			marginTop: 1,
			flexShrink: 0,
		});
		this.mainPanel.add(this.footerBar);

		const footerLeft = new TextRenderable(renderer, {
			id: "pr-preview-footer-left",
			content: "[Enter] Create PR | [ESC] Cancel | [Tab] Edit Title",
			fg: THEME.dim,
		});
		this.footerBar.add(footerLeft);

		this.statusText = new TextRenderable(renderer, {
			id: "pr-preview-status",
			content: "",
			fg: THEME.accent,
		});
		this.footerBar.add(this.statusText);

		this.root = this.overlay;
	}

	private setupKeyboard() {
		if (this.keyHandler) return;

		this.keyHandler = (key: KeyEvent) => {
			if (!this.isVisible || this.isLoading) return;

			// If title input is focused, let it handle keys
			if (this.titleInput.focused) {
				if (key.name === "escape") {
					this.titleInput.blur();
					this.isEditingTitle = false;
				} else if (key.name === "return" || key.name === "enter") {
					this.prTitle = this.titleInput.value;
					this.titleInput.blur();
					this.isEditingTitle = false;
				}
				return;
			}

			// Tab to edit title
			if (key.name === "tab") {
				this.isEditingTitle = true;
				this.titleInput.focus();
			}
			// Enter to confirm
			else if (key.name === "return" || key.name === "enter") {
				this.prTitle = this.titleInput.value;
				this.confirmCreate();
			}
			// Escape to cancel
			else if (key.name === "escape") {
				this.hide();
				this.events.onCancel();
			}
		};

		this.renderer.keyInput.on("keypress", this.keyHandler);
	}

	private cleanupKeyboard() {
		if (this.keyHandler) {
			this.renderer.keyInput.off("keypress", this.keyHandler);
			this.keyHandler = null;
		}
	}

	private async loadPRDescription() {
		if (!this.session?.worktreeInfo) return;

		this.isLoading = true;
		this.statusText.content = "Generating PR description...";
		this.renderer.requestRender();

		try {
			const { branchName, baseBranch } = this.session.worktreeInfo;
			const sessionDir = this.session.id;

			const prDesc = await generatePRDescription(
				sessionDir,
				branchName,
				baseBranch
			);

			this.prTitle = prDesc.title;
			this.prBody = prDesc.body;

			this.titleInput.value = this.prTitle;
			this.bodyPreview.content = this.prBody;
			this.statusText.content = "";
		} catch (error) {
			this.statusText.content = `Error: ${error instanceof Error ? error.message : "Failed to generate description"}`;
		} finally {
			this.isLoading = false;
			this.renderer.requestRender();
		}
	}

	private async confirmCreate() {
		if (!this.session || this.isLoading) return;

		this.isLoading = true;
		this.statusText.content = "Creating PR...";
		this.renderer.requestRender();

		try {
			await this.events.onConfirm(this.session, this.prTitle, this.prBody);
			this.hide();
		} catch (error) {
			this.statusText.content = `Error: ${error instanceof Error ? error.message : "Failed to create PR"}`;
			this.isLoading = false;
			this.renderer.requestRender();
		}
	}

	public async show(session: SessionData) {
		if (this.isVisible) return;
		if (!session.worktreeInfo) return;

		this.session = session;
		this.isVisible = true;
		this.overlay.visible = true;

		// Update title
		const { branchName, baseBranch } = session.worktreeInfo;
		this.titleText.content = `Create Pull Request: ${branchName} -> ${baseBranch}`;

		// Load PR description
		await this.loadPRDescription();

		// Setup keyboard
		this.setupKeyboard();

		this.renderer.requestRender();
	}

	public hide() {
		if (!this.isVisible) return;

		this.isVisible = false;
		this.overlay.visible = false;
		this.cleanupKeyboard();

		// Reset state
		this.prTitle = "";
		this.prBody = "";
		this.isEditingTitle = false;
		this.isLoading = false;
		this.titleInput.value = "";
		this.titleInput.blur();
		this.bodyPreview.content = "";
		this.statusText.content = "";

		this.renderer.requestRender();
	}

	public isOpen(): boolean {
		return this.isVisible;
	}

	public destroy() {
		this.cleanupKeyboard();
	}
}
