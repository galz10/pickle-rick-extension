#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'node:crypto';
import { printMinimalPanel, Style, getExtensionRoot } from '../services/pickle-utils.js';

function die(message: string): never {
  console.error(`${Style.RED}❌ Error: ${message}${Style.RESET}`);
  process.exit(1);
}

async function main() {
  const ROOT_DIR = getExtensionRoot();
  const SESSIONS_ROOT = path.join(ROOT_DIR, 'sessions');
  const JAR_ROOT = path.join(ROOT_DIR, 'jar');
  const WORKTREES_ROOT = path.join(ROOT_DIR, 'worktrees');
  const SESSIONS_MAP = path.join(ROOT_DIR, 'current_sessions.json');

  const updateSessionMap = (cwd: string, sessionPath: string) => {
    let map: Record<string, string> = {};
    if (fs.existsSync(SESSIONS_MAP)) {
      try {
        map = JSON.parse(fs.readFileSync(SESSIONS_MAP, 'utf-8'));
      } catch {
        /* ignore */
      }
    }
    map[cwd] = sessionPath;
    fs.writeFileSync(SESSIONS_MAP, JSON.stringify(map, null, 2));
  };

  // Ensure core directories exist
  [SESSIONS_ROOT, JAR_ROOT, WORKTREES_ROOT].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Defaults
  let loopLimit = 5;
  let timeLimit = 60;
  let workerTimeout = 1200;
  let promiseToken: string | null = null;
  let resumeMode = false;
  let resumePath: string | null = null;
  let resetMode = false;
  let pausedMode = false;
  const taskArgs: string[] = [];

  const startEpoch = Math.floor(Date.now() / 1000);

  // Load Settings
  const settingsFile = path.join(ROOT_DIR, 'pickle_settings.json');
  if (fs.existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      if (settings.default_max_iterations) loopLimit = settings.default_max_iterations;
      if (settings.default_max_time_minutes) timeLimit = settings.default_max_time_minutes;
      if (settings.default_worker_timeout_seconds)
        workerTimeout = settings.default_worker_timeout_seconds;
    } catch {
      /* ignore */
    }
  }

  // Argument Parser
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--max-iterations') {
      loopLimit = parseInt(args[++i]);
    } else if (arg === '--max-time') {
      timeLimit = parseInt(args[++i]);
    } else if (arg === '--worker-timeout') {
      workerTimeout = parseInt(args[++i]);
    } else if (arg === '--completion-promise') {
      promiseToken = args[++i];
    } else if (arg === '--resume') {
      resumeMode = true;
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        resumePath = args[++i];
      }
    } else if (arg === '--reset') {
      resetMode = true;
    } else if (arg === '--paused') {
      pausedMode = true;
    } else if (arg === '-s' || arg === '--session-id') {
      // Ignore session-id flag if passed by gemini, but consume the next arg if it's not a flag
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        i++;
      }
    } else {
      taskArgs.push(arg);
    }
  }

  const taskStr = taskArgs.join(' ').trim();
  let fullSessionPath = '';
  let currentIteration = 1;

  if (resumeMode) {
    if (resumePath) {
      fullSessionPath = resolvePath(resumePath);
    } else if (fs.existsSync(SESSIONS_MAP)) {
      const map = JSON.parse(fs.readFileSync(SESSIONS_MAP, 'utf-8'));
      fullSessionPath = map[process.cwd()] || '';
    }

    if (!fullSessionPath || !fs.existsSync(fullSessionPath)) {
      die(`No active session found or path invalid: ${fullSessionPath}`);
    }

    const statePath = path.join(fullSessionPath, 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    state.active = !pausedMode;
    if (resetMode) {
      state.iteration = 0;
      state.start_time_epoch = startEpoch;
    }

    // Update state with new limits if provided
    state.max_iterations = loopLimit;
    state.max_time_minutes = timeLimit;
    state.worker_timeout_seconds = workerTimeout;
    if (promiseToken) state.completion_promise = promiseToken;

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    currentIteration = state.iteration + 1;
    promiseToken = state.completion_promise;
    fullSessionPath = state.session_dir; // Use stored path
  } else {
    if (!taskStr) die('No task specified. Run /pickle --help for usage.');

    const today = new Date().toISOString().split('T')[0];
    const hash = crypto.randomBytes(4).toString('hex');
    const sessionId = `${today}-${hash}`;
    fullSessionPath = path.join(SESSIONS_ROOT, sessionId);

    if (!fs.existsSync(fullSessionPath)) fs.mkdirSync(fullSessionPath, { recursive: true });

    const state = {
      active: !pausedMode,
      working_dir: process.cwd(),
      step: 'prd',
      iteration: 0,
      max_iterations: loopLimit,
      max_time_minutes: timeLimit,
      worker_timeout_seconds: workerTimeout,
      start_time_epoch: startEpoch,
      completion_promise: promiseToken,
      original_prompt: taskStr,
      current_ticket: null,
      history: [],
      started_at: new Date().toISOString(),
      session_dir: fullSessionPath,
    };

    fs.writeFileSync(path.join(fullSessionPath, 'state.json'), JSON.stringify(state, null, 2));
  }

  updateSessionMap(process.cwd(), fullSessionPath);

  printMinimalPanel(
    'Pickle Rick Activated!',
    {
      Iteration: currentIteration,
      Limit: loopLimit > 0 ? loopLimit : '∞',
      'Max Time': `${timeLimit}m`,
      'Worker TO': `${workerTimeout}s`,
      Promise: promiseToken || 'None',
      Extension: ROOT_DIR,
      Path: fullSessionPath,
    },
    'GREEN',
    '🥒'
  );

  if (promiseToken) {
    console.log(`
${Style.YELLOW}⚠️  STRICT EXIT CONDITION ACTIVE${Style.RESET}`);
    console.log(`   You must output: <promise>${promiseToken}</promise>
`);
  }
}

function resolvePath(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

main().catch((err) => die(err.message));
