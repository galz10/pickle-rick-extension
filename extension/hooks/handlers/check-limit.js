import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
async function main() {
    const extensionDir = process.env.EXTENSION_DIR || path.join(os.homedir(), '.gemini/extensions/pickle-rick');
    const globalDebugLog = path.join(extensionDir, 'debug.log');
    let sessionHooksLog = null;
    const log = (msg) => {
        const ts = new Date().toISOString();
        const formatted = `[${ts}] [CheckLimitJS] ${msg}\n`;
        try {
            fs.appendFileSync(globalDebugLog, formatted);
        }
        catch {
            /* ignore */
        }
        if (sessionHooksLog) {
            try {
                fs.appendFileSync(sessionHooksLog, formatted);
            }
            catch {
                /* ignore */
            }
        }
    };
    // 1. Determine State File
    let stateFile = process.env.PICKLE_STATE_FILE;
    if (!stateFile) {
        const sessionsMapPath = path.join(extensionDir, 'current_sessions.json');
        if (fs.existsSync(sessionsMapPath)) {
            const map = JSON.parse(fs.readFileSync(sessionsMapPath, 'utf8'));
            const sessionPath = map[process.cwd()];
            if (sessionPath)
                stateFile = path.join(sessionPath, 'state.json');
        }
    }
    if (!stateFile || !fs.existsSync(stateFile)) {
        console.log(JSON.stringify({ decision: 'allow' }));
        return;
    }
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // 2. Check Context
    if (state.working_dir && path.resolve(state.working_dir) !== path.resolve(process.cwd())) {
        console.log(JSON.stringify({ decision: 'allow' }));
        return;
    }
    if (!state.active) {
        console.log(JSON.stringify({ decision: 'allow' }));
        return;
    }
    sessionHooksLog = path.join(path.dirname(stateFile), 'hooks.log');
    // 3. Check Limits
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - state.start_time_epoch;
    const maxTimeSeconds = state.max_time_minutes * 60;
    if (state.jar_complete) {
        log('Jar complete');
        console.log(JSON.stringify({ decision: 'deny', continue: false, reason: 'Jar processing complete' }));
        return;
    }
    if (state.max_time_minutes > 0 && elapsedSeconds >= maxTimeSeconds) {
        log(`Time limit exceeded: ${elapsedSeconds}/${maxTimeSeconds}s`);
        console.log(JSON.stringify({ decision: 'deny', continue: false, reason: 'Time limit exceeded' }));
        return;
    }
    if (state.max_iterations > 0 && state.iteration > state.max_iterations) {
        log(`Iteration limit exceeded: ${state.iteration}/${state.max_iterations}`);
        console.log(JSON.stringify({
            decision: 'deny',
            continue: false,
            reason: `Iteration limit exceeded (${state.iteration}/${state.max_iterations})`,
        }));
        return;
    }
    console.log(JSON.stringify({ decision: 'allow' }));
}
main().catch(() => console.log(JSON.stringify({ decision: 'allow' })));
