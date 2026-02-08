#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

/**
 * Usage: node update-state.js <key> <value> <session_dir>
 */

export function updateState(key: string, value: string, sessionDir: string) {
  const statePath = path.join(sessionDir, 'state.json');

  if (!fs.existsSync(statePath)) {
    throw new Error(`state.json not found at ${statePath}`);
  }

  const state: any = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  // Handle nested keys if needed (e.g. step, current_ticket)
  // For now, keep it simple for flat top-level keys
  state[key] = value;

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`Successfully updated ${key} to ${value} in ${statePath}`);
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('update-state')) {
  const [key, value, sessionDir] = process.argv.slice(2);

  if (!key || !value || !sessionDir) {
    console.error('Usage: node update-state.js <key> <value> <session_dir>');
    process.exit(1);
  }

  try {
    updateState(key, value, sessionDir);
  } catch (err: any) {
    console.error(`Failed to update state: ${err.message}`);
    process.exit(1);
  }
}
