#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SESSIONS_MAP = path.join(os.homedir(), ".gemini/extensions/pickle-rick/current_sessions.json");

function main() {
    if (!fs.existsSync(SESSIONS_MAP)) {
        process.exit(1);
    }

    const map = JSON.parse(fs.readFileSync(SESSIONS_MAP, 'utf-8'));
    const sessionPath = map[process.cwd()];

    if (!sessionPath || !fs.existsSync(sessionPath)) {
        process.exit(1);
    }

    process.stdout.write(sessionPath);
}

main();
