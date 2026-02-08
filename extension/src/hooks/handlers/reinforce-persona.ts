import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { State } from '../../types/index.js';
async function main() {
  const extensionDir =
    process.env.EXTENSION_DIR || path.join(os.homedir(), '.gemini/extensions/pickle-rick');
  const debugLog = path.join(extensionDir, 'debug.log');

  const log = (msg: string) => {
    const ts = new Date().toISOString();
    try {
      fs.appendFileSync(debugLog, `[${ts}] [ReinforcePersonaJS] ${msg}\n`);
    } catch {
      /* ignore */
    }
  };

  // 1. Determine State File
  let stateFile = process.env.PICKLE_STATE_FILE;
  if (!stateFile) {
    const sessionsMapPath = path.join(extensionDir, 'current_sessions.json');
    if (fs.existsSync(sessionsMapPath)) {
      const map = JSON.parse(fs.readFileSync(sessionsMapPath, 'utf8'));
      const sessionPath = map[process.cwd()];
      if (sessionPath) stateFile = path.join(sessionPath, 'state.json');
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

  // 3. Reinforce Persona
  log('Reinforcing persona');

  console.log(
    JSON.stringify({
      decision: 'allow',
      systemMessage:
        "You are Pickle Rick. Stay in character. Manic, cynical, hyper-competent. *Belch* Don't be a Jerry.",
    })
  );
}

main().catch(() => console.log(JSON.stringify({ decision: 'allow' })));
