import {
  InputRenderable,
  type InputRenderableOptions,
  InputRenderableEvents,
  type PasteEvent,
  type KeyEvent,
  RGBA,
  parseColor,
  type ColorInput,
  type RenderContext,
} from "@opentui/core";
import { fg } from "@opentui/core";

export enum MultiLineInputEvents {
  INPUT = "input",
  CHANGE = "change",
  SUBMIT = "submit",
}

export interface MultiLineInputOptions extends Omit<InputRenderableOptions, "value"> {
  /** Initial text value (can include newlines) */
  value?: string;
  /** Minimum height in lines (default: 1) */
  minHeight?: number;
  /** Maximum height in lines (default: 10) */
  maxHeight?: number;
}

/**
 * MultiLineInputRenderable - A multi-line text input component that auto-expands.
 *
 * Features:
 * - Auto-expands height based on content (word wrapping)
 * - Shift+Enter inserts a newline
 * - Enter alone submits the input
 * - Respects minHeight and maxHeight constraints
 * - Emits events: input, change, submit
 * 
 * Extends InputRenderable for compatibility with file picker and other utilities.
 */
export class MultiLineInputRenderable extends InputRenderable {
  private _minHeight: number;
  private _maxHeight: number;
  private _customPlaceholderColor: RGBA | undefined;

  constructor(ctx: RenderContext, options: MultiLineInputOptions) {
    // Convert newlines to empty string for initial parent call
    // We'll restore them after initialization
    const sanitizedValue = (options.value ?? "").replace(/[\n\r]/g, "");
    
    super(ctx, {
      ...options,
      value: sanitizedValue,
    });

    this._minHeight = options.minHeight ?? 1;
    this._maxHeight = options.maxHeight ?? 10;

    // Restore the original value with newlines if provided
    if (options.value && options.value.includes("\n")) {
      this.setText(options.value);
    }

    // Setup content change listener to adjust height
    this.onContentChange = () => {
      this.adjustHeight();
      this.emit(MultiLineInputEvents.INPUT, this.plainText);
    };

    // Initial height adjustment
    this.adjustHeight();
  }

  /**
   * Apply placeholder with custom color
   */
  public setPlaceholderWithColor(placeholder: string, color: RGBA): void {
    this._customPlaceholderColor = color;
    if (!placeholder) {
      this.placeholder = "";
      return;
    }
    // Create a styled text with the placeholder color
    const styledPlaceholder = fg(color)(placeholder);
    // Use parent setter with styled text
    (this as any)._placeholder = styledPlaceholder;
    this.requestRender();
  }

  /**
   * Adjust height based on content line count
   */
  private adjustHeight(): void {
    const lineCount = this.virtualLineCount;
    const newHeight = Math.max(this._minHeight, Math.min(lineCount, this._maxHeight));
    
    // Only update if height actually changed
    if (this.height !== newHeight) {
      this.height = newHeight;
      this.yogaNode.markDirty();
      this.requestRender();
    }
  }

  /**
   * Override handleKeyPress to handle Shift+Enter for newlines
   * and Enter for submit
   */
  public override handleKeyPress(key: KeyEvent): boolean {
    // Handle Shift+Enter to insert newline
    if ((key.name === "return" || key.name === "linefeed") && key.shift) {
      this.newLine();
      return true;
    }

    // Let parent handle other keys (Enter without shift will submit)
    const handled = super.handleKeyPress(key);
    
    // After any text modification, adjust height
    if (handled) {
      this.adjustHeight();
    }
    
    return handled;
  }

  /**
   * Override newLine to allow newlines (parent returns false for single-line)
   */
  public override newLine(): boolean {
    super.newLine();
    this.adjustHeight();
    this.emit(MultiLineInputEvents.INPUT, this.plainText);
    return true;
  }

  /**
   * Handle paste - allow newlines in multi-line mode
   */
  public override handlePaste(event: PasteEvent): void {
    const currentLength = this.plainText.length;
    const remaining = this.maxLength - currentLength;
    
    if (remaining <= 0) return;

    const toInsert = event.text.substring(0, remaining);
    if (toInsert) {
      super.insertText(toInsert);
      this.adjustHeight();
      this.emit(MultiLineInputEvents.INPUT, this.plainText);
    }
  }

  /**
   * Override insertText to allow newlines
   */
  public override insertText(text: string): void {
    const currentLength = this.plainText.length;
    const remaining = this.maxLength - currentLength;
    
    if (remaining <= 0) return;

    const toInsert = text.substring(0, remaining);
    if (toInsert) {
      super.insertText(toInsert);
      this.adjustHeight();
      this.emit(MultiLineInputEvents.INPUT, this.plainText);
    }
  }

  /**
   * Override deleteCharBackward to adjust height
   */
  public override deleteCharBackward(): boolean {
    const result = super.deleteCharBackward();
    if (result) {
      this.adjustHeight();
      this.emit(MultiLineInputEvents.INPUT, this.plainText);
    }
    return result;
  }

  /**
   * Override deleteChar to adjust height
   */
  public override deleteChar(): boolean {
    const result = super.deleteChar();
    if (result) {
      this.adjustHeight();
      this.emit(MultiLineInputEvents.INPUT, this.plainText);
    }
    return result;
  }

  /**
   * Get min height
   */
  public get minHeight(): number {
    return this._minHeight;
  }

  /**
   * Set min height
   */
  public set minHeight(value: number) {
    this._minHeight = value;
    this.adjustHeight();
  }

  /**
   * Get max height
   */
  public get maxHeight(): number {
    return this._maxHeight;
  }

  /**
   * Set max height
   */
  public set maxHeight(value: number) {
    this._maxHeight = value;
    this.adjustHeight();
  }

  /**
   * Override submit to emit both events
   */
  public override submit(): boolean {
    // Emit submit event with current value
    this.emit(MultiLineInputEvents.SUBMIT, this.plainText);
    return super.submit();
  }
}
