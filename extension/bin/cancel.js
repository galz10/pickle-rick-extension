#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { printMinimalPanel, getExtensionRoot } from '../services/pickle-utils.js';
export function cancelSession(cwd) {
    const SESSIONS_MAP = path.join(getExtensionRoot(), 'current_sessions.json');
    if (!fs.existsSync(SESSIONS_MAP)) {
        console.log('No active sessions map found.');
        return;
    }
    const map = JSON.parse(fs.readFileSync(SESSIONS_MAP, 'utf-8'));
    const sessionPath = map[cwd];
    if (!sessionPath || !fs.existsSync(sessionPath)) {
        console.log('No active session found for this directory.');
        return;
    }
    const statePath = path.join(sessionPath, 'state.json');
    if (!fs.existsSync(statePath)) {
        console.log('State file not found.');
        return;
    }
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.active = false;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    printMinimalPanel('Loop Cancelled', {
        Session: path.basename(sessionPath),
        Status: 'Inactive',
    }, 'RED', '🛑');
}
if (process.argv[1] && path.basename(process.argv[1]).startsWith('cancel')) {
    cancelSession(process.cwd());
}
