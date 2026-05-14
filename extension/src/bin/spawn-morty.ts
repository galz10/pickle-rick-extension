#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  formatTime,
  getExtensionRoot,
  printMinimalPanel,
  Style,
} from '../services/pickle-utils.js';

type OutputFormat = 'text' | 'json' | 'stream-json';

interface SpawnMortyArgs {
  task: string;
  ticketId: string;
  ticketPath: string;
  ticketFile?: string;
  timeoutSeconds: number;
  outputFormat: OutputFormat;
  model?: string;
}

function usage(): string {
  return [
    'Usage:',
    '  node spawn-morty.js --ticket-id <id> --ticket-path <path> [--ticket-file <file>] [--timeout <sec>] [--output-format <fmt>] [--model <model>] "<task>"',
    '',
    'Formats: text | json | stream-json',
  ].join('\n');
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }
  return parsed;
}

export function parseSpawnMortyArgs(argv: string[]): SpawnMortyArgs {
  let ticketId: string | undefined;
  let ticketPath: string | undefined;
  let ticketFile: string | undefined;
  let timeoutSeconds = 1200;
  let outputFormat: OutputFormat = 'text';
  let model: string | undefined;
  const taskParts: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--ticket-id') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        throw new Error('Missing value for --ticket-id');
      }
      ticketId = argv[++i];
      continue;
    }

    if (arg === '--ticket-path') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        throw new Error('Missing value for --ticket-path');
      }
      ticketPath = argv[++i];
      continue;
    }

    if (arg === '--ticket-file') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        throw new Error('Missing value for --ticket-file');
      }
      ticketFile = argv[++i];
      continue;
    }

    if (arg === '--timeout') {
      timeoutSeconds = parsePositiveInt(arg, argv[i + 1]);
      i++;
      continue;
    }

    if (arg === '--output-format') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --output-format');
      }
      if (value !== 'text' && value !== 'json' && value !== 'stream-json') {
        throw new Error(`Invalid --output-format value: ${value}`);
      }
      outputFormat = value;
      continue;
    }

    if (arg === '--model') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        throw new Error('Missing value for --model');
      }
      model = argv[++i];
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    taskParts.push(arg);
  }

  if (!ticketId || !ticketPath) {
    throw new Error('--ticket-id and --ticket-path are required.');
  }

  const task = taskParts.join(' ').trim();
  if (!task) {
    throw new Error('Task description is required as a positional argument.');
  }

  return {
    task,
    ticketId,
    ticketPath,
    ticketFile,
    timeoutSeconds,
    outputFormat,
    model,
  };
}

function detectQuotaExhausted(output: string): boolean {
  return /quota\s+exhausted|resource[_\s-]?exhausted|insufficient\s+quota|rate\s+limit|429/i.test(
    output
  );
}

function readTicketContent(ticketFile?: string): string {
  if (!ticketFile || !fs.existsSync(ticketFile)) {
    return '';
  }
  try {
    return fs.readFileSync(ticketFile, 'utf8');
  } catch {
    return '';
  }
}

function extractMortyPromptBase(extensionRoot: string): string {
  const tomlPath = path.join(extensionRoot, 'commands', 'send-to-morty.toml');
  const fallback =
    '# **TASK REQUEST**\n$ARGUMENTS\n\nYou are a Morty Worker. Implement the request above.';

  if (!fs.existsSync(tomlPath)) {
    return fallback;
  }

  try {
    const content = fs.readFileSync(tomlPath, 'utf8');
    const match = content.match(/prompt = """([\s\S]*?)"""/);
    return match?.[1]?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function clampWorkerTimeout(
  requestedTimeout: number,
  parentStatePath: string,
  workerStatePath: string
): { effectiveTimeout: number; timeoutStatePath: string | null } {
  let timeoutStatePath: string | null = null;
  if (fs.existsSync(parentStatePath)) {
    timeoutStatePath = parentStatePath;
  } else if (fs.existsSync(workerStatePath)) {
    timeoutStatePath = workerStatePath;
  }

  if (!timeoutStatePath) {
    return { effectiveTimeout: requestedTimeout, timeoutStatePath: null };
  }

  try {
    const state = JSON.parse(fs.readFileSync(timeoutStatePath, 'utf8')) as Record<string, unknown>;
    const maxMins = typeof state.max_time_minutes === 'number' ? state.max_time_minutes : 0;
    const startEpoch = typeof state.start_time_epoch === 'number' ? state.start_time_epoch : 0;

    if (maxMins > 0 && startEpoch > 0) {
      const remainingSeconds = Math.floor(maxMins * 60 - (Date.now() / 1000 - startEpoch));
      if (remainingSeconds < requestedTimeout) {
        const effectiveTimeout = Math.max(10, remainingSeconds);
        return { effectiveTimeout, timeoutStatePath };
      }
    }
  } catch {
    // Ignore malformed state and fall back to requested timeout.
  }

  return { effectiveTimeout: requestedTimeout, timeoutStatePath };
}

function normalizeTicketPath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (resolved.endsWith('.md') || (fs.existsSync(resolved) && fs.statSync(resolved).isFile())) {
    return path.dirname(resolved);
  }
  return resolved;
}

async function main() {
  let parsed: SpawnMortyArgs;
  try {
    parsed = parseSpawnMortyArgs(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${Style.RED}❌ ${message}${Style.RESET}`);
    console.error(usage());
    process.exit(1);
    return;
  }

  const ticketPath = normalizeTicketPath(parsed.ticketPath);
  fs.mkdirSync(ticketPath, { recursive: true });

  const sessionRoot = path.dirname(ticketPath);
  const parentStatePath = path.join(sessionRoot, 'state.json');
  const workerStatePath = path.join(ticketPath, 'state.json');
  const { effectiveTimeout, timeoutStatePath } = clampWorkerTimeout(
    parsed.timeoutSeconds,
    parentStatePath,
    workerStatePath
  );

  if (effectiveTimeout !== parsed.timeoutSeconds) {
    console.log(`${Style.YELLOW}⚠️  Worker timeout clamped: ${effectiveTimeout}s${Style.RESET}`);
  }

  const sessionLog = path.join(ticketPath, `worker_session_${process.pid}.log`);
  printMinimalPanel(
    'Spawning Morty Worker',
    {
      Request: parsed.task,
      Ticket: parsed.ticketId,
      Format: parsed.outputFormat,
      Timeout: `${effectiveTimeout}s (Req: ${parsed.timeoutSeconds}s)`,
      Model: parsed.model || 'default',
      PID: process.pid,
    },
    'CYAN',
    '🥒'
  );

  const extensionRoot = getExtensionRoot();
  const includes = [extensionRoot, path.join(extensionRoot, 'skills'), ticketPath];

  const cmdArgs: string[] = ['-s', '-y'];
  for (const include of includes) {
    if (fs.existsSync(include)) {
      cmdArgs.push('--include-directories', include);
    }
  }

  if (parsed.outputFormat !== 'text') {
    cmdArgs.push('-o', parsed.outputFormat);
  }
  if (parsed.model) {
    cmdArgs.push('--model', parsed.model);
  }

  let workerPrompt = extractMortyPromptBase(extensionRoot).replace(
    /\${extensionPath}/g,
    extensionRoot
  );
  workerPrompt = workerPrompt.replace(/\$ARGUMENTS/g, parsed.task);

  const ticketContent = readTicketContent(parsed.ticketFile);
  workerPrompt += `\n\n# TARGET TICKET CONTENT\n${ticketContent || 'N/A'}`;
  workerPrompt += `\n\n# EXECUTION CONTEXT\n- SESSION_ROOT: ${sessionRoot}\n- TICKET_ID: ${parsed.ticketId}\n- TICKET_DIR: ${ticketPath}`;
  workerPrompt +=
    '\n\n**IMPORTANT**: You are a localized worker. You are FORBIDDEN from working on ANY other tickets. Once you output `<promise>I AM DONE</promise>`, you MUST STOP and let the manager take over.';
  if (workerPrompt.length < 500) {
    workerPrompt +=
      '\n\n1. Activate persona: `activate_skill("load-pickle-persona")`.\n2. Follow the Rick Loop lifecycle.\n3. Output: <promise>I AM DONE</promise>';
  }
  cmdArgs.push('-p', workerPrompt);

  const env = {
    ...process.env,
    PICKLE_STATE_FILE: timeoutStatePath || workerStatePath,
    PICKLE_ROLE: 'worker',
  };

  const logStream = fs.createWriteStream(sessionLog, { flags: 'w' });
  const proc = spawn('gemini', cmdArgs, {
    cwd: process.cwd(),
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);

  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const startTime = Date.now();
  let spinnerIdx = 0;
  let timedOut = false;

  const spinnerTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const spinChar = spinner[spinnerIdx % spinner.length];
    process.stdout.write(
      `\r   ${Style.CYAN}${spinChar}${Style.RESET} Worker Active... ${Style.DIM}[${formatTime(elapsed)}]${Style.RESET}\x1b[K`
    );
    spinnerIdx++;
  }, 100);

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
    console.log(`\n${Style.RED}❌ Worker timed out after ${effectiveTimeout}s${Style.RESET}`);
  }, effectiveTimeout * 1000);

  proc.on('close', (code) => {
    clearInterval(spinnerTimer);
    clearTimeout(timeoutHandle);
    process.stdout.write('\r\x1b[K');
    logStream.end();

    const output = fs.existsSync(sessionLog) ? fs.readFileSync(sessionLog, 'utf8') : '';
    const hasDonePromise = output.includes('<promise>I AM DONE</promise>');
    const quotaExhausted = detectQuotaExhausted(output);

    // Performance Optimization: Context Window Compression
    // Truncate massive logs to prevent blowing up the Manager's context window.
    if (output.length > 50000) {
      const truncatedOutput =
        output.substring(0, 25000) +
        `\n\n... [LOG TRUNCATED FOR CONTEXT COMPRESSION: ${output.length - 50000} bytes removed] ...\n\n` +
        output.substring(output.length - 25000);
      fs.writeFileSync(sessionLog, truncatedOutput, 'utf8');
      console.log(`${Style.YELLOW}⚠️  Worker log compressed to save context window.${Style.RESET}`);
    }

    let exitCode = 0;
    let validation = 'successful';
    let status = `exit:${code ?? 0}`;

    if (timedOut) {
      exitCode = 124;
      validation = 'timeout';
      status = 'timeout';
    } else if (hasDonePromise) {
      exitCode = 0;
      validation = 'successful';
    } else if (quotaExhausted) {
      exitCode = 78;
      validation = 'quota-exhausted';
      status = 'quota-exhausted';
      console.log(`${Style.YELLOW}QUOTA EXHAUSTED${Style.RESET}`);
    } else {
      exitCode = 1;
      validation = 'failed';
    }

    printMinimalPanel(
      'Worker Report',
      {
        status,
        validation,
      },
      exitCode === 0 ? 'GREEN' : 'RED',
      '🥒'
    );

    process.exit(exitCode);
  });
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('spawn-morty')) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${Style.RED}❌ ${message}${Style.RESET}`);
    process.exit(1);
  });
}
