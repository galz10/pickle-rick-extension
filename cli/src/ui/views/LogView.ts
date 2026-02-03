import fs from "node:fs";
import fsp from "node:fs/promises";
import {
  CliRenderer,
  BoxRenderable,
  TextRenderable,
  StyledText,
  parseColor,
  type TextChunk,
  ScrollBoxRenderable,
} from "@opentui/core";
import { THEME } from "../theme.js";

interface LogLine {
  content: string;
  color: string;
}

export class LogView {
  public root: BoxRenderable;
  private logFilePath: string;
  private fileHandle: fsp.FileHandle | null = null;
  private lastSize: number = 0;
  private tailInterval: ReturnType<typeof setTimeout> | null = null;
  private tailing: boolean = false;
  private isDestroyed = false;
  private renderer: CliRenderer;
  private lines: LogLine[] = [];
  private textRenderable: TextRenderable;
  private scrollBox: ScrollBoxRenderable;
  private readonly MAX_LINES = 8000; // Allow deeper backscroll before truncation
  private readonly RENDER_CHUNK_SIZE = this.MAX_LINES; // Render everything we keep so older iterations stay visible
  private updateTimeout: ReturnType<typeof setTimeout> | null = null;
  private onNewLines?: () => void;
  private lastUpdateTime: number = 0;

  constructor(renderer: CliRenderer, logFilePath: string, onNewLines?: () => void) {
    this.renderer = renderer;
    this.logFilePath = logFilePath;
    this.onNewLines = onNewLines;

    this.root = new BoxRenderable(renderer, {
      id: "log-view-root",
      width: "100%",
      height: "100%",
      backgroundColor: THEME.bg,
      flexDirection: "column",
      flexGrow: 1,
    });

    this.scrollBox = new ScrollBoxRenderable(renderer, {
      id: "log-view-scroll",
      width: "100%",
      height: "100%",
      flexGrow: 1,
      scrollY: true,
      stickyScroll: true,
      stickyStart: "bottom",
      backgroundColor: THEME.bg,
      scrollbarOptions: {
        trackOptions: {
          backgroundColor: THEME.darkAccent,
          foregroundColor: THEME.accent,
        },
      },
    });

    this.textRenderable = new TextRenderable(renderer, {
      id: "log-view-text",
      width: "100%",
      height: "auto",
      content: "[ Initializing Log View... ]",
      fg: THEME.dim,
    });
    this.scrollBox.add(this.textRenderable);
    this.root.add(this.scrollBox);

    this.init();
  }

  private formatLogLine(content: string): LogLine {
    const stripped = this.stripAnsi(content);
    const trimmed = stripped.trim();

    let color = THEME.text;

    if (trimmed.startsWith("[Phase") || trimmed.startsWith("[Iteration") || trimmed.startsWith("Phase")) {
      color = THEME.accent;
    } else if (trimmed.startsWith(">>")) {
      color = THEME.blue;
    } else if (/ERROR|FAILED|Exception|Error:/i.test(trimmed)) {
      color = THEME.error;
    } else if (/WARNING|CAUTION/i.test(trimmed)) {
      color = THEME.warning;
    } else if (/\[DONE\]|SUCCESS|Successfully/i.test(trimmed)) {
      color = THEME.green;
    }

    return { content: stripped, color };
  }

  private async init() {
    try {
      await fsp.access(this.logFilePath, fs.constants.R_OK);
      this.fileHandle = await fsp.open(this.logFilePath, "r");
      const stats = await this.fileHandle.stat();
      this.lastSize = stats.size;

      if (stats.size > 0) {
        const content = await fsp.readFile(this.logFilePath, "utf8");
        const rawLines = content.split("\n");
        
        const linesToProcess = rawLines[rawLines.length - 1] === "" 
          ? rawLines.slice(0, -1) 
          : rawLines;

        const lastLines = linesToProcess.slice(-this.MAX_LINES);
        this.addRawLines(lastLines);
      }
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.addRawLines([`[Error reading log: ${error.message}]`]);
      }
    }

    this.startTailing();
  }

  public startTailing() {
    if (this.tailing) return;
    this.tailing = true;
    this.poll();
  }

  private async poll() {
    if (!this.tailing) return;
    try {
      await this.checkFile();
    } catch (e) {
      // Silence background poll errors
    } finally {
      this.tailInterval = setTimeout(() => this.poll(), 500) as any;
    }
  }

  public stopTailing() {
    this.tailing = false;
    if (this.tailInterval) {
      clearTimeout(this.tailInterval);
      this.tailInterval = null;
    }
  }

  private async checkFile() {
    try {
      if (!this.fileHandle) {
        try {
          await fsp.access(this.logFilePath, fs.constants.R_OK);
          this.fileHandle = await fsp.open(this.logFilePath, "r");
          const stats = await this.fileHandle.stat();
          this.lastSize = stats.size;
          return;
        } catch {
          return;
        }
      }

      const stats = await this.fileHandle.stat();
      if (stats.size > this.lastSize) {
        const bufferSize = stats.size - this.lastSize;
        const buffer = Buffer.alloc(bufferSize);
        
        await this.fileHandle.read(buffer, 0, bufferSize, this.lastSize);

        const content = buffer.toString();
        this.lastSize = stats.size;
        
        const rawLines = content.split("\n");
        if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
          rawLines.pop();
        }
        
        this.addRawLines(rawLines);
      } else if (stats.size < this.lastSize) {
        this.lastSize = stats.size;
        this.addRawLines(["[Log file truncated]"]);
      }
    } catch (error) {
      if (this.fileHandle) {
        await this.fileHandle.close().catch(() => {});
        this.fileHandle = null;
      }
      this.addRawLines([`[Error reading log file: ${error}]`]);
    }
  }

  private stripAnsi(text: string): string {
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
  }

  private addRawLines(newLines: string[]) {
    if (this.isDestroyed) return;
    if (newLines.length === 0) return;

    const formatted = newLines.map(line => this.formatLogLine(line));

    this.lines.push(...formatted);
    if (this.lines.length > this.MAX_LINES) {
      this.lines = this.lines.slice(-this.MAX_LINES);
    }
    
    // Clear existing timeout and force immediate update if it's been > 500ms
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    
    // Use shorter timeout for more frequent updates, or immediate if it's been a while
    const timeoutDuration = timeSinceLastUpdate > 500 ? 0 : 50;
    
    this.updateTimeout = setTimeout(() => {
      this.updateRenderable();
      this.onNewLines?.();
      this.updateTimeout = null;
    }, timeoutDuration);
  }

  private updateRenderable() {
    if (this.isDestroyed) return;
    const now = Date.now();
    this.lastUpdateTime = now;
    
    // For very long logs, only render the last RENDER_CHUNK_SIZE lines to improve performance
    const linesToRender = this.lines.length > this.RENDER_CHUNK_SIZE 
      ? this.lines.slice(-this.RENDER_CHUNK_SIZE)
      : this.lines;
    
    const chunks: TextChunk[] = linesToRender.map((line, i) => ({
      __isChunk: true,
      text: line.content + (i === linesToRender.length - 1 ? "" : "\n"),
      fg: parseColor(line.color),
    }));
    
    // Add a truncation indicator if we're not showing all lines
    if (this.lines.length > this.RENDER_CHUNK_SIZE) {
      const hiddenCount = this.lines.length - this.RENDER_CHUNK_SIZE;
      chunks.unshift({
        __isChunk: true,
        text: `[... ${hiddenCount} earlier lines hidden for performance ...]\n`,
        fg: parseColor(THEME.dim),
      });
    }
    
    this.textRenderable.content = new StyledText(chunks);
    if (this.scrollBox) {
      this.scrollBox.scrollTo({ x: 0, y: this.scrollBox.scrollHeight });
    }
  }

  public async destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stopTailing();
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    if (this.fileHandle) {
      await this.fileHandle.close().catch(() => {});
      this.fileHandle = null;
    }
    this.root.destroyRecursively();
  }
}
