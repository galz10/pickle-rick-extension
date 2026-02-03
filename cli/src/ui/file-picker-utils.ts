import { CliRenderer, InputRenderable, InputRenderableEvents, BoxRenderable, Renderable, SyntaxStyle, RGBA } from "@opentui/core";
import { FilePickerView } from "./components/FilePickerView.js";
import { recursiveSearch } from "../utils/search.js";
import { THEME } from "./theme.js";

export interface FilePickerState {
  activePicker: FilePickerView | null;
  justClosed?: boolean;
}

/**
 * Regex to match @-prefixed file paths.
 * Matches patterns like @file/path or @src/ui/FilePickerView.ts
 */
const FILE_PATH_REGEX = /@([^\s@]+)/g;

// Unique reference for our highlights
const FILE_PATH_HL_REF = 9999;

/**
 * Sets up a file picker that triggers when " @" is typed in the input.
 * Also handles atomic deletion of @-prefixed file paths with backspace/delete.
 * And adds syntax highlighting to @-prefixed file paths.
 * Returns a cleanup function.
 */
type PickerPositionValue = number | string;
type PickerPositionResolver = () => number;

export function setupFilePicker(
  renderer: CliRenderer,
  input: InputRenderable,
  container: BoxRenderable | (Renderable & { add: (r: Renderable) => void, remove: (id: string) => void }),
  state: FilePickerState,
  options: { bottom?: PickerPositionValue | PickerPositionResolver, left?: PickerPositionValue, width?: PickerPositionValue } = {}
) {
  const resolveBottom = (): number => {
    if (typeof options.bottom === "function") {
      return options.bottom();
    }
    if (typeof options.bottom === "number") {
      return options.bottom;
    }
    return 5;
  };
  // Setup syntax highlighting for file paths
  const syntaxStyle = SyntaxStyle.create();
  const filePathStyleId = syntaxStyle.registerStyle("filepath", {
    fg: RGBA.fromHex(THEME.accent),
    bold: true,
  });
  input.syntaxStyle = syntaxStyle;

  const cleanupPicker = () => {
    if (state.activePicker) {
      state.activePicker.destroy();
      container.remove(state.activePicker.id);
      state.activePicker = null;

      // Set a brief grace period to prevent auto-submission on Enter
      state.justClosed = true;
      setTimeout(() => {
        state.justClosed = false;
      }, 50);

      input.focus();
      renderer.requestRender();
    }
  };

  /**
   * Update highlights for all @-prefixed file paths in the input
   */
  const updateFilePathHighlights = () => {
    // Clear existing file path highlights
    input.removeHighlightsByRef(FILE_PATH_HL_REF);
    
    const value = input.value;
    if (!value || filePathStyleId === null) return;

    // Find all @-prefixed file paths and highlight them
    let match;
    FILE_PATH_REGEX.lastIndex = 0;
    while ((match = FILE_PATH_REGEX.exec(value)) !== null) {
      input.addHighlightByCharRange({
        start: match.index,
        end: match.index + match[0].length,
        styleId: filePathStyleId,
        hlRef: FILE_PATH_HL_REF,
      });
    }
  };

  /**
   * Check if the cursor is at the end of an @-prefixed file path and delete it atomically.
   * Returns true if a path was deleted, false otherwise.
   */
  const tryAtomicDelete = (): boolean => {
    // Only delete atomically when picker is not active
    if (state.activePicker) return false;

    const value = input.value;
    if (value.length === 0) return false;

    // Find all @-prefixed file paths in the text
    const matches: { start: number; end: number; text: string }[] = [];
    let match;
    FILE_PATH_REGEX.lastIndex = 0;
    while ((match = FILE_PATH_REGEX.exec(value)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }

    // Check if value ends with a @-prefixed path and delete the entire path
    for (const m of matches) {
      if (m.end === value.length) {
        // Delete the entire @-prefixed path
        const newValue = value.slice(0, m.start);
        input.value = newValue;
        updateFilePathHighlights();
        renderer.requestRender();
        return true;
      }
    }

    return false;
  };

  // Override the input's deleteCharBackward method to handle atomic deletion
  const originalDeleteCharBackward = input.deleteCharBackward.bind(input);
  input.deleteCharBackward = (): boolean => {
    // Try atomic deletion first (when picker is closed and cursor is at end of @-path)
    if (tryAtomicDelete()) {
      return true;
    }
    // Otherwise, use the default behavior
    return originalDeleteCharBackward();
  };

  input.on(InputRenderableEvents.INPUT, async (value: string) => {
    // Update highlights whenever input changes
    updateFilePathHighlights();

    const triggerMatch = value.match(/(?:^| )@([^ ]*)$/);
    if (triggerMatch) {
      const query = triggerMatch[1];
      const { files } = await recursiveSearch(process.cwd(), query);
      const normalizedFiles = files.map((f) => f.replace(process.cwd() + "/", ""));

      if (normalizedFiles.length > 0) {
        const pickerBottom = resolveBottom();
        if (!state.activePicker) {
          state.activePicker = new FilePickerView(
            renderer,
            normalizedFiles,
            {
              onSelect: (item) => {
                // Keep the @ prefix when inserting the file path
                const newValue = value.replace(/(^| )@[^ ]*$/, "$1@" + item);
                input.value = newValue;
                updateFilePathHighlights();
                cleanupPicker();
              },
              onCancel: () => cleanupPicker(),
            },
            {
              position: "absolute",
              bottom: pickerBottom,
              left: options.left ?? 0,
              width: options.width ?? "100%",
              maxHeight: 10,
              zIndex: 2000,
            }
          );
          container.add(state.activePicker);
        } else {
          (state.activePicker as any).bottom = pickerBottom;
          state.activePicker.updateItems(normalizedFiles);
        }
      } else {
        cleanupPicker();
      }
      renderer.requestRender();
    } else {
      cleanupPicker();
      renderer.requestRender();
    }
  });

  // Return enhanced cleanup
  const originalCleanup = cleanupPicker;
  return () => {
    // Restore original deleteCharBackward method
    input.deleteCharBackward = originalDeleteCharBackward;
    syntaxStyle.destroy();
    originalCleanup();
  };
}
