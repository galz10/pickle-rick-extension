import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), ".pickle");
const LOG_FILE = join(LOG_DIR, "cli.log");

async function writeLog(line: string): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line + "\n", "utf-8");
  } catch (err) {
    // Only surface write issues when debugging; otherwise stay quiet
    if (process.env.DEBUG) {
      console.error("[logger] failed to write log:", err);
    }
  }
}

// Simple wrappers that write to log file; echo to console only in DEBUG
export function logInfo(msg: string) {
  void writeLog(`[INFO] ${msg}`);
  if (process.env.DEBUG) console.log(`[INFO] ${msg}`);
}

export function logSuccess(msg: string) {
  void writeLog(`[SUCCESS] ${msg}`);
  if (process.env.DEBUG) console.log(`[SUCCESS] ${msg}`);
}

export function logError(msg: string) {
  void writeLog(`[ERROR] ${msg}`);
  if (process.env.DEBUG) console.error(`[ERROR] ${msg}`);
}

export function logWarn(msg: string) {
  void writeLog(`[WARN] ${msg}`);
  if (process.env.DEBUG) console.warn(`[WARN] ${msg}`);
}

export function logDebug(msg: string) {
  if (process.env.DEBUG) {
    console.debug(`[DEBUG] ${msg}`);
  }
  void writeLog(`[DEBUG] ${msg}`);
}
