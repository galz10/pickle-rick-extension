import {
	BoxRenderable,
	TextRenderable,
	TextAttributes,
	ScrollBoxRenderable,
	CliRenderer,
	KeyEvent,
	DiffRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	type SelectOption,
	parseColor,
	SyntaxStyle,
} from "@opentui/core";
import { THEME } from "../theme.js";
import type { SessionData, WorktreeInfo } from "../../types/tasks.js";
import {
	getChangedFiles,
	getFileDiff,
	getFileType,
	getStatusIndicator,
	getStatusColor,
	type ChangedFile,
} from "../../services/git/index.js";

export interface DiffViewDialogEvents {
	onMerge: (session: SessionData) => Promise<void>;
	onCreatePR: (session: SessionData) => Promise<void>;
	onReject: (session: SessionData) => Promise<void>;
	onClose: () => void;
}

export class DiffViewDialog {
	public root: BoxRenderable;
	private renderer: CliRenderer;
	private isVisible = false;
	private session: SessionData | null = null;
	private events: DiffViewDialogEvents;
	private keyHandler: ((key: KeyEvent) => void) | null = null;

	// UI Elements
	private overlay: BoxRenderable;
	private mainPanel: BoxRenderable;
	private headerBar: BoxRenderable;
	private titleText: TextRenderable;
	private leftPanel: BoxRenderable;
	private rightPanel: BoxRenderable;
	private footerBar: BoxRenderable;
	private fileSelect: SelectRenderable;
	private diffContainer: ScrollBoxRenderable;
	private diffView: DiffRenderable | null = null;
	private noDiffText: TextRenderable;
	private syntaxStyle: SyntaxStyle;

	// State
	private changedFiles: ChangedFile[] = [];
	private currentFileIndex = 0;
	private viewMode: "unified" | "split" = "unified";
	private wrapMode: "none" | "word" = "none";

	constructor(renderer: CliRenderer, events: DiffViewDialogEvents) {
		this.renderer = renderer;
		this.events = events;

		// Create syntax style for diff view
		this.syntaxStyle = SyntaxStyle.fromStyles({
			keyword: { fg: parseColor("#FF7B72"), bold: true },
			"keyword.import": { fg: parseColor("#FF7B72"), bold: true },
			string: { fg: parseColor("#A5D6FF") },
			comment: { fg: parseColor("#8B949E"), italic: true },
			number: { fg: parseColor("#79C0FF") },
			boolean: { fg: parseColor("#79C0FF") },
			constant: { fg: parseColor("#79C0FF") },
			function: { fg: parseColor("#D2A8FF") },
			"function.call": { fg: parseColor("#D2A8FF") },
			constructor: { fg: parseColor("#FFA657") },
			type: { fg: parseColor("#FFA657") },
			operator: { fg: parseColor("#FF7B72") },
			variable: { fg: parseColor("#E6EDF3") },
			property: { fg: parseColor("#79C0FF") },
			bracket: { fg: parseColor("#F0F6FC") },
			punctuation: { fg: parseColor("#F0F6FC") },
			default: { fg: parseColor("#E6EDF3") },
		});

		// Background overlay
		this.overlay = new BoxRenderable(renderer, {
			id: "diff-view-overlay",
			width: "100%",
			height: "100%",
			position: "absolute",
			left: 0,
			top: 0,
			backgroundColor: THEME.bg,
			visible: false,
			zIndex: 30000,
			flexDirection: "column",
		});

		// Main panel
		this.mainPanel = new BoxRenderable(renderer, {
			id: "diff-view-main",
			width: "100%",
			height: "100%",
			flexDirection: "column",
		});
		this.overlay.add(this.mainPanel);

		// Header bar
		this.headerBar = new BoxRenderable(renderer, {
			id: "diff-view-header",
			width: "100%",
			height: 3,
			flexDirection: "row",
			alignItems: "center",
			paddingLeft: 2,
			paddingRight: 2,
			backgroundColor: THEME.surface,
			borderColor: THEME.accent,
			border: ["bottom"],
			flexShrink: 0,
		});
		this.mainPanel.add(this.headerBar);

		this.titleText = new TextRenderable(renderer, {
			id: "diff-view-title",
			content: "Review Changes",
			fg: THEME.accent,
			attributes: TextAttributes.BOLD,
		});
		this.headerBar.add(this.titleText);

		// Content area (file picker + diff view)
		const contentArea = new BoxRenderable(renderer, {
			id: "diff-view-content",
			width: "100%",
			flexGrow: 1,
			flexDirection: "row",
		});
		this.mainPanel.add(contentArea);

		// Left panel - File picker (30% width)
		this.leftPanel = new BoxRenderable(renderer, {
			id: "diff-view-left",
			width: "30%",
			height: "100%",
			flexDirection: "column",
			backgroundColor: THEME.surface,
			borderColor: THEME.darkAccent,
			border: ["right"],
			padding: 1,
		});
		contentArea.add(this.leftPanel);

		const fileListHeader = new TextRenderable(renderer, {
			id: "diff-view-file-header",
			content: "Changed Files",
			fg: THEME.white,
			attributes: TextAttributes.BOLD,
			marginBottom: 1,
		});
		this.leftPanel.add(fileListHeader);

		this.fileSelect = new SelectRenderable(renderer, {
			id: "diff-view-file-select",
			width: "100%",
			flexGrow: 1,
			options: [],
			backgroundColor: THEME.surface,
			textColor: THEME.text,
			selectedBackgroundColor: THEME.darkAccent,
			selectedTextColor: THEME.accent,
			focusedBackgroundColor: THEME.surface,
			focusedTextColor: THEME.text,
			descriptionColor: THEME.dim,
			selectedDescriptionColor: THEME.dim,
			showScrollIndicator: true,
			wrapSelection: true,
			showDescription: true,
		});
		this.leftPanel.add(this.fileSelect);

		// Right panel - Diff view (70% width)
		this.rightPanel = new BoxRenderable(renderer, {
			id: "diff-view-right",
			width: "70%",
			height: "100%",
			flexDirection: "column",
			backgroundColor: THEME.bg,
			padding: 1,
		});
		contentArea.add(this.rightPanel);

		this.diffContainer = new ScrollBoxRenderable(renderer, {
			id: "diff-view-scroll",
			width: "100%",
			flexGrow: 1,
			scrollY: true,
			scrollX: true,
			backgroundColor: THEME.bg,
		});
		this.rightPanel.add(this.diffContainer);

		this.noDiffText = new TextRenderable(renderer, {
			id: "diff-view-no-diff",
			content: "Select a file to view diff",
			fg: THEME.dim,
		});
		this.diffContainer.add(this.noDiffText);

		// Footer bar
		this.footerBar = new BoxRenderable(renderer, {
			id: "diff-view-footer",
			width: "100%",
			height: 3,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingLeft: 2,
			paddingRight: 2,
			backgroundColor: THEME.surface,
			borderColor: THEME.darkAccent,
			border: ["top"],
			flexShrink: 0,
		});
		this.mainPanel.add(this.footerBar);

		const footerLeft = new TextRenderable(renderer, {
			id: "diff-view-footer-left",
			content: "[M] Merge | [P] Create PR | [R] Reject | [ESC] Cancel",
			fg: THEME.dim,
		});
		this.footerBar.add(footerLeft);

		const footerRight = new TextRenderable(renderer, {
			id: "diff-view-footer-right",
			content: "[V] View Mode | [W] Wrap | [j/k] Navigate",
			fg: THEME.dim,
		});
		this.footerBar.add(footerRight);

		this.root = this.overlay;

		// Setup file selection event
		this.fileSelect.on(
			SelectRenderableEvents.SELECTION_CHANGED,
			(index: number) => {
				this.currentFileIndex = index;
				this.loadFileDiff();
			}
		);

		this.fileSelect.on(
			SelectRenderableEvents.ITEM_SELECTED,
			(index: number) => {
				this.currentFileIndex = index;
				this.loadFileDiff();
			}
		);
	}

	private setupKeyboard() {
		if (this.keyHandler) return;

		this.keyHandler = (key: KeyEvent) => {
			if (!this.isVisible) return;

			// File navigation
			if (key.name === "up" || key.name === "k") {
				this.fileSelect.moveUp();
			} else if (key.name === "down" || key.name === "j") {
				this.fileSelect.moveDown();
			} else if (key.name === "return" || key.name === "enter") {
				this.fileSelect.selectCurrent();
			}
			// View mode toggle
			else if (key.name === "v" && !key.ctrl && !key.meta) {
				this.viewMode = this.viewMode === "unified" ? "split" : "unified";
				if (this.diffView) {
					this.diffView.view = this.viewMode;
				}
				this.renderer.requestRender();
			}
			// Wrap mode toggle
			else if (key.name === "w" && !key.ctrl && !key.meta) {
				this.wrapMode = this.wrapMode === "none" ? "word" : "none";
				if (this.diffView) {
					this.diffView.wrapMode = this.wrapMode;
				}
				this.renderer.requestRender();
			}
			// Merge action
			else if (key.name === "m" && !key.ctrl && !key.meta) {
				if (this.session) {
					this.events.onMerge(this.session);
				}
			}
			// Reject / cleanup worktree
			else if (key.name === "r" && !key.ctrl && !key.meta) {
				if (this.session) {
					this.events.onReject(this.session);
				}
			}
			// Create PR action
			else if (key.name === "p" && !key.ctrl && !key.meta) {
				if (this.session) {
					this.events.onCreatePR(this.session);
				}
			}
			// Close
			else if (key.name === "escape") {
				this.hide();
				this.events.onClose();
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

	private async loadChangedFiles() {
		if (!this.session?.worktreeInfo) return;

		const { worktreeDir, baseBranch } = this.session.worktreeInfo;

		const disallowedExtensions = new Set([
			"png",
			"jpg",
			"jpeg",
			"gif",
			"webp",
			"bmp",
			"tiff",
			"ico",
			"svg",
			"pdf",
			"zip",
			"tar",
			"gz",
			"tgz",
			"bz2",
			"xz",
			"7z",
			"mov",
			"mp4",
			"mkv",
			"avi",
			"mp3",
			"wav",
			"ogg",
			"flac",
			"woff",
			"woff2",
			"ttf",
			"otf",
			"psd",
			"ai",
		]);

		const isRenderableFile = (path: string): boolean => {
			const ext = path.split(".").pop()?.toLowerCase() ?? "";
			return !disallowedExtensions.has(ext);
		};

		try {
			const allFiles = await getChangedFiles(worktreeDir, baseBranch);
			this.changedFiles = allFiles.filter((file) => isRenderableFile(file.path));

			const options: SelectOption[] = this.changedFiles.map((file) => {
				const indicator = getStatusIndicator(file.status);
				const stats =
					file.additions > 0 || file.deletions > 0
						? `+${file.additions} -${file.deletions}`
						: "";
				return {
					name: `${indicator} ${file.path}`,
					description: stats,
					value: file.path,
				};
			});

			this.fileSelect.options = options;

			if (this.changedFiles.length > 0) {
				this.currentFileIndex = 0;
				this.fileSelect.setSelectedIndex(0);
				await this.loadFileDiff();
			} else {
				this.noDiffText.content = "No renderable text changes (images/binaries hidden)";
				this.noDiffText.visible = true;
				this.diffView = null;
			}
		} catch (error) {
			console.error("Failed to load changed files:", error);
		}
	}

	private async loadFileDiff() {
		if (!this.session?.worktreeInfo || this.changedFiles.length === 0) return;

		const { worktreeDir, baseBranch } = this.session.worktreeInfo;
		const file = this.changedFiles[this.currentFileIndex];

		if (!file) return;

		try {
			const diff = await getFileDiff(worktreeDir, baseBranch, file.path, file.status);
			const filetype = getFileType(file.path);
			const syntaxStyle = this.syntaxStyle ?? SyntaxStyle.fromStyles({});

			// Remove the "no diff" text
			this.noDiffText.visible = false;

			// Create or update diff view
			if (!this.diffView) {
				this.diffView = new DiffRenderable(this.renderer, {
					id: "diff-view-renderable",
					diff,
					view: this.viewMode,
					filetype,
					syntaxStyle,
					showLineNumbers: true,
					wrapMode: this.wrapMode,
					addedBg: "#1a4d1a",
					removedBg: "#4d1a1a",
					contextBg: "transparent",
					addedSignColor: "#22c55e",
					removedSignColor: "#ef4444",
					lineNumberFg: "#6b7280",
					lineNumberBg: "#161b22",
					addedLineNumberBg: "#0d3a0d",
					removedLineNumberBg: "#3a0d0d",
					width: "100%",
					flexGrow: 1,
				});
				this.diffContainer.add(this.diffView);
			} else {
				this.diffView.diff = diff;
				this.diffView.filetype = filetype;
			}

			this.renderer.requestRender();
		} catch (error) {
			console.error("Failed to load file diff:", error);
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
		this.titleText.content = `Review Changes: ${branchName} -> ${baseBranch}`;

		// Load changed files
		await this.loadChangedFiles();

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
		this.changedFiles = [];
		this.currentFileIndex = 0;
		if (this.diffView) {
			this.diffContainer.remove(this.diffView.id);
			this.diffView = null;
		}
		this.noDiffText.visible = true;
		this.fileSelect.options = [];

		this.renderer.requestRender();
	}

	public isOpen(): boolean {
		return this.isVisible;
	}

	public getSession(): SessionData | null {
		return this.session;
	}

	public destroy() {
		this.cleanupKeyboard();
		if (this.diffView) {
			this.diffView.destroy();
		}
		this.syntaxStyle.destroy();
	}
}
