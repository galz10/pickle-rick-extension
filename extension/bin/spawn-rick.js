#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'node:crypto';
import { printBanner, Style, getExtensionRoot } from '../services/pickle-utils.js';
async function main() {
    const ROOT_DIR = getExtensionRoot();
    const SESSIONS_ROOT = path.join(ROOT_DIR, 'sessions');
    const args = process.argv.slice(2);
    const task = args.join(' ');
    if (!task) {
        console.error('Usage: node spawn-rick.js <task description>');
        process.exit(1);
    }
    const today = new Date().toISOString().split('T')[0];
    const hash = crypto.randomBytes(4).toString('hex');
    const sessionId = `${today}-${hash}`;
    const sessionDir = path.join(SESSIONS_ROOT, sessionId);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    // Create state.json
    const state = {
        active: true,
        working_dir: process.cwd(),
        step: 'prd',
        iteration: 1,
        start_time_epoch: Math.floor(Date.now() / 1000),
        original_prompt: task,
        session_dir: sessionDir,
    };
    fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));
    printBanner('Rick Cycle Initialized', 'GREEN');
    console.log(`Session: ${sessionId}`);
    console.log(`Path:    ${sessionDir}\n`);
}
main().catch((err) => {
    console.error(`${Style.RED}Error: ${err.message}${Style.RESET}`);
    process.exit(1);
});
