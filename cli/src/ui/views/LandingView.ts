import {
  CliRenderer,
  BoxRenderable,
  TextRenderable,
  KeyEvent,
} from "@opentui/core";
import * as fs from "fs";
import * as path from "path";
import { HEADER_LINES, getLineColor } from "../common.js";
import { THEME } from "../theme.js";
import { setupFilePicker, FilePickerState } from "../file-picker-utils.js";
import { getCurrentBranch } from "../../services/git/branch.js";
import { isGameboyActive } from "../../games/gameboy/GameboyView.js";
import { MultiLineInputRenderable, MultiLineInputEvents } from "../components/MultiLineInput.js";
import { buildVerticalBar, createInputContainerMouseHandler, createProviderMetadataRow, createCtrlCExitHandler } from "../input-chrome.js";

/**
 * Creates the landing view for the Pickle Rick CLI.
 * Returns the root container and the input component for further event handling.
 */
export async function createLandingView(
  renderer: CliRenderer,
  onEnter: (prompt: string, mode: "pickle" | "pickle-prd") => void
) {
  const INPUT_CHROME_LINES = 4;
  let mode: "pickle" | "pickle-prd" = "pickle";

  // Fetch Metadata
  const cwd = process.cwd();
  let version = "?.?.?";
  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      version = pkg.version || "?.?.?";
    }
  } catch (e) {
    // Ignore
  }

  const root = new BoxRenderable(renderer, {
    id: "landing-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.bg,
  });

  const headerContainer = new BoxRenderable(renderer, {
    id: "landing-header",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 2,
  });

  HEADER_LINES.forEach((line, i) => {
    const color = getLineColor(i);
    headerContainer.add(
      new TextRenderable(renderer, {
        id: `landing-header-line-${i}`,
        content: line.trimEnd(),
        fg: color,
      })
    );
  });

  const inputContainer = new BoxRenderable(renderer, {
    id: "landing-input-container",
    width: 80,
    minHeight: 5,
    flexDirection: "column",
    backgroundColor: THEME.surface,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const input = new MultiLineInputRenderable(renderer, {
    id: "landing-input",
    flexGrow: 1,
    placeholder: "I turned myself into a TUI, Morty! *Belch* Ask me anything...",
    textColor: THEME.text,
    focusedTextColor: THEME.text,
    minHeight: 1,
    maxHeight: 10,
  });

  const inputRow = new BoxRenderable(renderer, {
    id: "landing-input-row",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  });
  inputRow.add(input);

  const { row: metadataRow } = createProviderMetadataRow(renderer, "landing");

  inputContainer.add(new BoxRenderable(renderer, { id: "landing-spacer1", height: 1 }));
  inputContainer.add(inputRow);
  inputContainer.add(new BoxRenderable(renderer, { id: "landing-spacer2", height: 1 }));
  inputContainer.add(metadataRow);
  inputContainer.add(new BoxRenderable(renderer, { id: "landing-spacer3", height: 1 }));

  // Bottom footer bar with cwd and version
  const footerBar = new BoxRenderable(renderer, {
    id: "landing-footer-bar",
    width: "100%",
    height: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
    bottom: 0,
    left: 0,
    paddingLeft: 1,
    paddingRight: 1,
  });

  const footerCwd = new TextRenderable(renderer, {
    id: "landing-footer-cwd",
    content: cwd,
    fg: THEME.dim,
  });
  footerBar.add(footerCwd);

  const footerVersion = new TextRenderable(renderer, {
    id: "landing-footer-version",
    content: version,
    fg: THEME.dim,
  });
  footerBar.add(footerVersion);

  // Fetch branch asynchronously
  getCurrentBranch().then((branch) => {
    if (branch) {
      footerCwd.content = `${cwd}:${branch}`;
      renderer.requestRender();
    }
  });

  const inputDecorativeBar = new TextRenderable(renderer, {
    id: "landing-decorative-bar",
    content: buildVerticalBar(inputContainer.minHeight ?? 5),
    fg: THEME.accent,
    position: "absolute",
    left: 0,
    top: 0,
  });
  inputContainer.add(inputDecorativeBar);

  const footerHints = new BoxRenderable(renderer, {
    id: "landing-footer-hints",
    width: 80,
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 1,
  });

  const hintsText = new TextRenderable(renderer, {
    id: "landing-hints-text",
    content: "ctrl+c exit",
    fg: THEME.dim,
  });
  footerHints.add(hintsText);

  inputContainer.onMouse = createInputContainerMouseHandler(inputContainer, input);

  const pickerState: FilePickerState = { activePicker: null };

  input.on(MultiLineInputEvents.INPUT, (value: string) => {
    const minHeight = typeof inputContainer.minHeight === "number" ? inputContainer.minHeight : 5;
    const inputHeight = typeof input.height === "number" ? input.height : 1;
    const nextHeight = Math.max(minHeight, inputHeight + INPUT_CHROME_LINES);
    if (inputContainer.height !== nextHeight) {
      inputContainer.height = nextHeight;
      inputDecorativeBar.content = buildVerticalBar(nextHeight);
      renderer.requestRender();
    }
  });

  input.on(MultiLineInputEvents.SUBMIT, (value: string) => {
    if (pickerState.activePicker || pickerState.justClosed || isGameboyActive()) return;
    onEnter(value, mode);
  });

  const onKey = createCtrlCExitHandler({
    renderer,
    hintText: hintsText,
    originalContent: "ctrl+c exit",
    shouldSkip: () => !root.visible || !!pickerState.activePicker || isGameboyActive(),
  });

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "return" && key.shift) {
      input.value = input.value + "\n";
      renderer.requestRender();
      return true;
    }
    return false;
  });

  renderer.keyInput.on("keypress", onKey);

  setupFilePicker(renderer, input, inputContainer, pickerState, {
    bottom: () => {
      const height = inputContainer.height;
      return typeof height === "number" ? height : 5;
    },
    width: "100%",
  });

  root.add(headerContainer);
  root.add(inputContainer);
  root.add(footerHints);
  root.add(footerBar);

  input.focus();

  return { root, input };
}
