#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';

const EXTENSION_DIR = join(os.homedir(), '.gemini/extensions/pickle-rick');
const HANDLERS_DIR = join(EXTENSION_DIR, 'extension', 'hooks', 'handlers');
const LOG_PATH = join(EXTENSION_DIR, 'debug.log');

// Prevent EPIPE errors from crashing the dispatcher when Gemini closes the pipe
const handleEpipe = (err: any) => {
  if (err.code === 'EPIPE') process.exit(0);
};
process.stdout.on('error', handleEpipe);
process.stderr.on('error', handleEpipe);

function log(message: string) {
  try {
    const timestamp = new Date().toISOString();
    appendFileSync(LOG_PATH, `[${timestamp}] [dispatcher] ${message}\n`);
  } catch {
    /* ignore */
  }
}

function logError(message: string) {
  console.error(`Dispatcher Error: ${message}`);
  log(`ERROR: ${message}`);
}

function allow() {
  console.log(JSON.stringify({ decision: 'allow' }));
}

function findExecutable(name: string): string | null {
  const pathEnv = process.env.PATH || '';
  const paths = pathEnv.split(process.platform === 'win32' ? ';' : ':');
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];

  for (const p of paths) {
    for (const ext of extensions) {
      const fullPath = join(p, name + ext);
      if (existsSync(fullPath)) return fullPath;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: dispatch_hook <hook_name> [args...]');
    process.exit(1);
  }

  const [hookName, ...extraArgs] = args;
  log(`Dispatching hook: ${hookName} (cwd: ${process.cwd()})`);
  const isWindows = process.platform === 'win32';

  let scriptPath: string;
  let cmd: string;
  let cmdArgs: string[];

  const jsPath = join(HANDLERS_DIR, `${hookName}.js`);
  if (existsSync(jsPath)) {
    scriptPath = jsPath;
    cmd = 'node';
    cmdArgs = [scriptPath, ...extraArgs];
  } else if (isWindows) {
    const HOOKS_DIR = join(EXTENSION_DIR, 'hooks');
    scriptPath = join(HOOKS_DIR, `${hookName}.ps1`);
    const exe = findExecutable('pwsh') || findExecutable('powershell');
    if (!exe) {
      logError('PowerShell not found.');
      allow();
      process.exit(0);
    }
    cmd = exe;
    cmdArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs];
  } else {
    const HOOKS_DIR = join(EXTENSION_DIR, 'hooks');
    scriptPath = join(HOOKS_DIR, `${hookName}.sh`);
    cmd = 'bash';
    cmdArgs = [scriptPath, ...extraArgs];
  }

  if (!existsSync(scriptPath)) {
    logError(`Hook script not found: ${scriptPath}`);
    allow();
    process.exit(0);
  }

  let inputData = '';
  if (!process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      inputData = Buffer.concat(chunks).toString();
      log(`Input Data: ${inputData}`);
    } catch (e) {
      log(`Error reading stdin: ${e}`);
    }
  }

  try {
    const child = spawn(cmd, cmdArgs, {
      env: { ...process.env, EXTENSION_DIR },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin?.on('error', (err: any) => {
      if (err.code === 'EPIPE') {
        // Ignore EPIPE on stdin
        return;
      }
      logError(`Child stdin error: ${err}`);
    });

    if (inputData) {
      try {
        child.stdin?.write(inputData);
      } catch (err: any) {
        if (err.code !== 'EPIPE') throw err;
      }
    }
    child.stdin?.end();

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => (stdout += data.toString()));
    child.stderr?.on('data', (data) => (stderr += data.toString()));

    child.on('close', (code) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      if (!stdout.trim()) {
        if (code !== 0 && code !== null) {
          logError(`Hook ${hookName} failed with code ${code} and no output.`);
        }
        allow();
      }
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      logError(`Failed to start child process: ${err}`);
      allow();
      process.exit(0);
    });
  } catch (e) {
    logError(`Unexpected execution error: ${e}`);
    allow();
    process.exit(0);
  }
}

main();
