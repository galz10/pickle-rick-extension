import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'node:url';

export const Style = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  MAGENTA: '\x1b[35m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  RESET: '\x1b[0m',
} as const;

export type StyleColor = keyof typeof Style;

export function getWidth(maxW: number = 90): number {
  const cols = process.stdout.columns || 80;
  return Math.min(cols - 4, maxW);
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  const words = text.split(' ');
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length <= width) {
      currentLine += (currentLine === '' ? '' : ' ') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      while (currentLine.length > width) {
        lines.push(currentLine.slice(0, width));
        currentLine = currentLine.slice(width);
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

export function printMinimalPanel(
  title: string,
  fields: Record<string, string | number | boolean | null | undefined>,
  colorName: StyleColor = 'GREEN',
  icon: string = '🥒'
) {
  const width = getWidth();
  const c = Style[colorName] || Style.GREEN;
  const r = Style.RESET;
  const b = Style.BOLD;
  const d = Style.DIM;

  if (title) {
    process.stdout.write(`\n${c}${icon} ${b}${title}${r}\n`);
  }

  const fieldKeys = Object.keys(fields);
  if (fieldKeys.length === 0) {
    process.stdout.write('\n');
    return;
  }

  const maxKeyLen = Math.max(...fieldKeys.map((k) => k.length)) + 1;

  for (const [key, value] of Object.entries(fields)) {
    const valWidth = width - maxKeyLen - 5;
    const wrappedVal = wrapText(String(value), valWidth);

    process.stdout.write(
      `  ${d}${key + ':'}${' '.repeat(maxKeyLen - key.length - 1)}${r} ${wrappedVal[0]}\n`
    );
    for (let i = 1; i < wrappedVal.length; i++) {
      process.stdout.write(`  ${' '.repeat(maxKeyLen)} ${wrappedVal[i]}\n`);
    }
  }
  process.stdout.write('\n');
}

export function printBanner(text: string, colorName: StyleColor = 'CYAN') {
  const c = Style[colorName] || Style.CYAN;
  const r = Style.RESET;
  const b = Style.BOLD;
  const line = '='.repeat(60);
  process.stdout.write(`\n${b}${c}${line}${r}\n`);
  process.stdout.write(`${b}${c}  ${text}${r}\n`);
  process.stdout.write(`${b}${c}${line}${r}\n\n`);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export interface ShellError extends Error {
  stderr?: Buffer | string;
  stdout?: Buffer | string;
}

export function run_cmd(
  cmd: string | string[],
  options: { cwd?: string; check?: boolean; capture?: boolean } = {}
): string {
  const { cwd, check = true, capture = true } = options;
  const command = Array.isArray(cmd) ? cmd.join(' ') : cmd;
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    return (stdout || '').trim();
  } catch (error) {
    const err = error as ShellError;
    if (check)
      throw new Error(
        `Command failed: ${command}\nError: ${err.stderr?.toString() || err.message}`
      );
    return err.stdout?.toString().trim() || '';
  }
}

export async function spawn_cmd(
  cmd: string[],
  options: { cwd?: string; onData?: (data: string) => void } = {}
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    proc.stdout?.on('data', (data) => options.onData?.(data.toString()));
    proc.stderr?.on('data', (data) => options.onData?.(data.toString()));

    proc.on('close', (code) => {
      resolve(code || 0);
    });

    proc.on('error', (err) => {
      console.error(`Failed to start process: ${err}`);
      resolve(1);
    });
  });
}

export function getExtensionRoot(): string {
  return path.join(os.homedir(), '.gemini/extensions/pickle-rick');
}

export function getSessionDir(): string | null {
  try {
    const extensionRoot = getExtensionRoot();
    const getSessionScript = path.join(extensionRoot, 'extension/bin/get-session.js');
    if (fs.existsSync(getSessionScript)) {
      const res = run_cmd(['node', getSessionScript], { capture: true, check: false });
      return res || null;
    }
  } catch (e) {
    // Ignore
  }
  return null;
}
