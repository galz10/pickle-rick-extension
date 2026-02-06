#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const SESSIONS_MAP = path.join(os.homedir(), ".gemini/extensions/pickle-rick/current_sessions.json");
export function getSessionPath(cwd) {
    if (!fs.existsSync(SESSIONS_MAP)) {
        return null;
    }
    const map = JSON.parse(fs.readFileSync(SESSIONS_MAP, 'utf-8'));
    const sessionPath = map[cwd];
    if (!sessionPath || !fs.existsSync(sessionPath)) {
        return null;
    }
    return sessionPath;
}
if (process.argv[1] && path.basename(process.argv[1]).startsWith('get_session')) {
    const sessionPath = getSessionPath(process.cwd());
    if (sessionPath) {
        process.stdout.write(sessionPath);
    }
    else {
        process.exit(1);
    }
}
