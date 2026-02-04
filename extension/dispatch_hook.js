#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = resolve(__dirname, '..');
const HOOKS_DIR = join(EXTENSION_DIR, 'hooks');
const LOG_PATH = join(EXTENSION_DIR, 'debug.log');
function logError(message) {
    console.error(`Dispatcher Error: ${message}`);
    try {
        const timestamp = new Date().toISOString();
        appendFileSync(LOG_PATH, `[${timestamp}] [dispatch_hook] ${message}
`);
    }
    catch { /* ignore */ }
}
function allow() {
    console.log(JSON.stringify({ decision: 'allow' }));
}
function findExecutable(name) {
    const pathEnv = process.env.PATH || '';
    const paths = pathEnv.split(process.platform === 'win32' ? ';' : ':');
    const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];
    for (const p of paths) {
        for (const ext of extensions) {
            const fullPath = join(p, name + ext);
            if (existsSync(fullPath))
                return fullPath;
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
    const isWindows = process.platform === 'win32';
    let scriptPath;
    let cmd;
    let cmdArgs;
    if (isWindows) {
        scriptPath = join(HOOKS_DIR, `${hookName}.ps1`);
        const exe = findExecutable('pwsh') || findExecutable('powershell');
        if (!exe) {
            logError("PowerShell not found.");
            allow();
            process.exit(0);
        }
        cmd = exe;
        cmdArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs];
    }
    else {
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
        }
        catch { /* ignore */ }
    }
    try {
        const child = spawn(cmd, cmdArgs, {
            env: { ...process.env, EXTENSION_DIR },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        if (inputData)
            child.stdin?.write(inputData);
        child.stdin?.end();
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', data => stdout += data.toString());
        child.stderr?.on('data', data => stderr += data.toString());
        child.on('close', code => {
            if (stdout)
                process.stdout.write(stdout);
            if (stderr)
                process.stderr.write(stderr);
            if (!stdout.trim()) {
                if (code !== 0 && code !== null) {
                    logError(`Hook ${hookName} failed with code ${code} and no output.`);
                }
                allow();
            }
            process.exit(code ?? 0);
        });
        child.on('error', err => {
            logError(`Failed to start child process: ${err}`);
            allow();
            process.exit(0);
        });
    }
    catch (e) {
        logError(`Unexpected execution error: ${e}`);
        allow();
        process.exit(0);
    }
}
main();
