#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

/**
 * Usage: node update_state.js <key> <value> <session_dir>
 */

const [key, value, sessionDir] = process.argv.slice(2);

if (!key || !value || !sessionDir) {
    console.error("Usage: node update_state.js <key> <value> <session_dir>");
    process.exit(1);
}

const statePath = path.join(sessionDir, "state.json");

if (!fs.existsSync(statePath)) {
    console.error(`Error: state.json not found at ${statePath}`);
    process.exit(1);
}

try {
    const state: any = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    
    // Handle nested keys if needed (e.g. step, current_ticket)
    // For now, keep it simple for flat top-level keys
    state[key] = value;
    
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log(`Successfully updated ${key} to ${value} in ${statePath}`);
} catch (err: any) {
    console.error(`Failed to update state: ${err.message}`);
    process.exit(1);
}
