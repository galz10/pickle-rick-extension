import {
  CliRenderer,
  BoxRenderable,
  TextRenderable,
  RGBA,
  KeyEvent,
} from "@opentui/core";
import { createMultiGradientText, capitalizeProvider } from "../utils/index.js";
import { getConfiguredProvider, getConfiguredModel } from "../services/providers/index.js";
import { THEME } from "./theme.js";

const DOUBLE_TAP_THRESHOLD = 1000; // ms

/**
 * Builds a vertical decorative bar string of the specified height
 * Accepts number or percentage string (percentage strings default to 5)
 */
export function buildVerticalBar(height: number | `${number}%` | undefined): string {
  const h = typeof height === "number" ? height : 5;
  if (h <= 0) return "";
  return Array.from({ length: h }, () => "┃").join("\n");
}

/**
 * Mouse hover/press handler factory for input containers
 */
export function createInputContainerMouseHandler(
  container: BoxRenderable,
  focusTarget?: { focus: () => void }
) {
  return (event: { type: string }) => {
    if (event.type === "click" && focusTarget) {
      focusTarget.focus();
    }
    switch (event.type) {
      case "over":
        container.backgroundColor = "#2d372d";
        break;
      case "out":
        container.backgroundColor = THEME.surface;
        break;
      case "down":
        container.backgroundColor = "#1a241a";
        break;
      case "up":
        container.backgroundColor = "#2d372d";
        break;
    }
  };
}

const PROVIDER_GRADIENT_COLORS = [
  RGBA.fromHex("#1b5e20"),
  RGBA.fromHex("#43a047"),
  RGBA.fromHex("#76ff03"),
];

/**
 * Creates a metadata row with provider gradient text
 * Returns { row, providerLabel, modelLabel, updateProvider }
 */
export function createProviderMetadataRow(
  renderer: CliRenderer,
  idPrefix: string
) {
  const row = new BoxRenderable(renderer, {
    id: `${idPrefix}-metadata-row`,
    width: "100%",
    height: 1,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 1,
  });

  const pickleLabel = new TextRenderable(renderer, {
    id: `${idPrefix}-meta-l`,
    content: "Pickle",
    fg: THEME.green,
  });
  row.add(pickleLabel);

  const providerLabel = new TextRenderable(renderer, {
    id: `${idPrefix}-meta-m`,
    content: createMultiGradientText("Loading...", PROVIDER_GRADIENT_COLORS),
  });
  row.add(providerLabel);

  const modelLabel = new TextRenderable(renderer, {
    id: `${idPrefix}-meta-r`,
    content: "",
    fg: THEME.dim,
  });
  row.add(modelLabel);

  // Fetch and update provider info asynchronously
  Promise.all([getConfiguredProvider(), getConfiguredModel()])
    .then(([provider, model]) => {
      const displayProvider = capitalizeProvider(provider || "gemini");
      providerLabel.content = createMultiGradientText(
        displayProvider,
        PROVIDER_GRADIENT_COLORS
      );
      modelLabel.content = model ? `(${model})` : "";
      renderer.requestRender();
    })
    .catch(() => {
      providerLabel.content = createMultiGradientText(
        "Gemini",
        PROVIDER_GRADIENT_COLORS
      );
      modelLabel.content = "";
      renderer.requestRender();
    });

  return {
    row,
    pickleLabel,
    providerLabel,
    modelLabel,
  };
}

export interface CtrlCExitHandlerOptions {
  /** The renderer to use for requestRender and destroy */
  renderer: CliRenderer;
  /** The text renderable to show the hint in */
  hintText: TextRenderable;
  /** The original content to restore after timeout */
  originalContent: string | ReturnType<typeof createMultiGradientText>;
  /** Optional callback to check if handler should be skipped (e.g., picker active) */
  shouldSkip?: () => boolean;
}

/**
 * Creates a Ctrl+C double-tap exit handler.
 * Returns a keypress handler function that can be attached to renderer.keyInput.on("keypress", ...)
 */
export function createCtrlCExitHandler(options: CtrlCExitHandlerOptions) {
  const { renderer, hintText, originalContent, shouldSkip } = options;
  let lastCtrlCTime = 0;
  let ctrlCHintTimeout: ReturnType<typeof setTimeout> | null = null;

  return (key: KeyEvent): boolean => {
    if (shouldSkip?.()) return false;

    if (key.ctrl && key.name === "c") {
      const now = Date.now();
      if (now - lastCtrlCTime < DOUBLE_TAP_THRESHOLD) {
        // Double Ctrl+C - exit
        if (ctrlCHintTimeout) clearTimeout(ctrlCHintTimeout);
        renderer.destroy();
        process.exit(0);
      } else {
        // First Ctrl+C - show hint
        lastCtrlCTime = now;
        hintText.content = "Press Ctrl+C again to exit";
        hintText.fg = THEME.warning;
        renderer.requestRender();

        // Clear hint after threshold
        if (ctrlCHintTimeout) clearTimeout(ctrlCHintTimeout);
        ctrlCHintTimeout = setTimeout(() => {
          hintText.content = originalContent;
          hintText.fg = THEME.dim;
          renderer.requestRender();
        }, DOUBLE_TAP_THRESHOLD);
      }
      return true;
    }
    return false;
  };
}
