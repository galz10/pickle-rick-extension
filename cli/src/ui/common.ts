import { RGBA } from "@opentui/core";
import { lerpColor } from "../utils/index.js";

export const HEADER_LINES = [
  "██▓███      ██▓    ▄████▄      ██ ▄█▀    ██▓       ▓█████           ██▀███      ██▓    ▄████▄      ██ ▄█▀",
  "▓██░  ██▒   ▓██▒   ▒██▀ ▀█      ██▄█▒    ▓██▒       ▓█   ▀          ▓██ ▒ ██▒   ▓██▒   ▒██▀ ▀█      ██▄█▒",
  "▓██░ ██▓▒   ▒██▒   ▒▓█    ▄    ▓███▄░    ▒██░       ▒███            ▓██ ░▄█ ▒   ▒██▒   ▒▓█    ▄    ▓███▄░",
  "▒██▄█▓▒ ▒   ░██░   ▒▓▓▄ ▄██▒   ▓██ █▄    ▒██░       ▒▓█  ▄          ▒██▀▀█▄     ░██░   ▒▓▓▄ ▄██▒   ▓██ █▄",
  "▒██▒ ░      ░██░   ▒ ▓███▀ ░   ▒██▒ █▄   ░██████▒   ░▒████▒         ░██▓ ▒██▒   ░██░   ▒ ▓███▀ ░   ▒██▒ █▄",
  "▒▓▒░ ░      ░▓     ░ ░▒ ▒  ░   ▒ ▒▒ ▓▒   ░ ▒░▓  ░   ░░ ▒░ ░         ░ ▒▓ ░▒▓░   ░▓     ░ ░▒ ▒  ░   ▒ ▒▒ ▓▒",
  "░▒ ░         ▒ ░     ░  ▒      ░ ░▒ ▒░   ░ ░ ▒  ░    ░ ░  ░           ░▒ ░ ▒░    ▒ ░     ░  ▒      ░ ░▒ ▒░",
  "░░           ▒ ░   ░           ░ ░░ ░      ░ ░         ░              ░░   ░     ▒ ░   ░           ░ ░░ ░",
             " ░     ░ ░         ░  ░          ░  ░      ░  ░            ░         ░     ░ ░         ░  ░",
                   " ░                                                                   ░",
];

export const GRADIENT_STOPS = [
  RGBA.fromHex("#1b5e20"),
  RGBA.fromHex("#43a047"),
  RGBA.fromHex("#76ff03"),
];

export function getLineColor(index: number): RGBA {
  const t = index / (HEADER_LINES.length - 1);
  const [c1, c2, c3] = GRADIENT_STOPS;

  return t <= 0.5 ? lerpColor(c1, c2, t * 2) : lerpColor(c2, c3, (t - 0.5) * 2);
}
