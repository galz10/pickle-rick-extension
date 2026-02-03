import { RGBA, StyledText, type TextChunk, parseColor, rgbToHex } from "@opentui/core";

export function lerpColor(c1: RGBA, c2: RGBA, t: number): RGBA {
  return RGBA.fromValues(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
    c1.a + (c2.a - c1.a) * t,
  );
}

export function lerpColorHex(color1: string, color2: string, factor: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = c1.r + (c2.r - c1.r) * factor;
  const g = c1.g + (c2.g - c1.g) * factor;
  const b = c1.b + (c2.b - c1.b) * factor;
  const a = c1.a + (c2.a - c1.a) * factor;
  return rgbToHex(RGBA.fromValues(r, g, b, a));
}

export function createGradientText(text: string, startColor: RGBA, endColor: RGBA): StyledText {
  return createMultiGradientText(text, [startColor, endColor]);
}

/**
 * Creates a StyledText with a multi-stop gradient.
 * @param text The text to stylize.
 * @param colors An array of RGBA colors acting as stops.
 */
export function createMultiGradientText(text: string, colors: RGBA[]): StyledText {
  if (text.length === 0 || colors.length === 0) {
    return new StyledText([]);
  }

  const chunks: TextChunk[] = [];
  const numColors = colors.length;

  for (let i = 0; i < text.length; i++) {
    let color: RGBA;
    if (numColors === 1) {
      color = colors[0];
    } else {
      const t = text.length > 1 ? i / (text.length - 1) : 0;
      const scaledT = t * (numColors - 1);
      const segmentIndex = Math.min(Math.floor(scaledT), numColors - 2);
      const localT = scaledT - segmentIndex;

      color = lerpColor(colors[segmentIndex], colors[segmentIndex + 1], localT);
    }

    chunks.push({
      text: text[i],
      fg: color,
      __isChunk: true,
    });
  }
  return new StyledText(chunks);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}s`;
}

export function isSessionActive(status: string): boolean {
  const statusLower = status.toLowerCase();
  return (
    !statusLower.includes("done") &&
    !statusLower.includes("cancelled") &&
    !statusLower.includes("error")
  );
}

export { Clipboard } from "./clipboard.js";

/**
 * Capitalize provider name for display
 * e.g., "opencode" -> "OpenCode", "gemini" -> "Gemini CLI"
 */
export function capitalizeProvider(name: string): string {
  const specialCases: Record<string, string> = {
    opencode: "OpenCode",
    gemini: "Gemini CLI",
    claude: "Claude",
    cursor: "Cursor",
    codex: "Codex",
    qwen: "Qwen",
    droid: "Droid",
    copilot: "Copilot",
  };
  return specialCases[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
}
