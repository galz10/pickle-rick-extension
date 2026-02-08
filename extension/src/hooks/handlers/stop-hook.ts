import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { State, HookInput } from '../../types/index.js';

async function main() {
  const extensionDir =
    process.env.EXTENSION_DIR || path.join(os.homedir(), '.gemini/extensions/pickle-rick');

  const globalDebugLog = path.join(extensionDir, 'debug.log');

  let sessionHooksLog: string | null = null;

  const log = (msg: string) => {
    const ts = new Date().toISOString();
    const formatted = `[${ts}] [StopHookJS] ${msg}\n`;
    try {
      fs.appendFileSync(globalDebugLog, formatted);
    } catch {
      /* ignore */
    }
    if (sessionHooksLog) {
      try {
        fs.appendFileSync(sessionHooksLog, formatted);
      } catch {
        /* ignore */
      }
    }
  };

  // 1. Read Input
  let inputData = '';
  try {
    inputData = fs.readFileSync(0, 'utf8');
  } catch {
    log('Failed to read stdin');
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const input: HookInput = JSON.parse(inputData || '{}');
  log(`Processing AfterAgent hook. Input size: ${inputData.length}`);

  // 2. Determine State File
  let stateFile = process.env.PICKLE_STATE_FILE;
  if (!stateFile) {
    const sessionsMapPath = path.join(extensionDir, 'current_sessions.json');
    log(`Checking sessions map at: ${sessionsMapPath}`);
    if (fs.existsSync(sessionsMapPath)) {
      const map = JSON.parse(fs.readFileSync(sessionsMapPath, 'utf8'));
      const sessionPath = map[process.cwd()];
      log(`Found session path for ${process.cwd()}: ${sessionPath}`);
      if (sessionPath) stateFile = path.join(sessionPath, 'state.json');
    }
  }

  if (!stateFile || !fs.existsSync(stateFile)) {
    log(`No state file found. (stateFile: ${stateFile})`);
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Initialize session-specific hook log
  sessionHooksLog = path.join(path.dirname(stateFile), 'hooks.log');
  log(`State file found: ${stateFile}`);

  // 3. Read State
  const state: State = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

  // 4. Check Context
  if (state.working_dir && path.resolve(state.working_dir) !== path.resolve(process.cwd())) {
    log(`CWD Mismatch: ${process.cwd()} !== ${state.working_dir}`);
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // 5. Bypass for Workers or Inactive loops
  const role = process.env.PICKLE_ROLE;
  const isWorker = role === 'worker' || state.worker;

  log(`State: active=${state.active}, iteration=${state.iteration}/${state.max_iterations}`);
  log(`Context: role=${role}, isWorker=${isWorker}, cwd=${process.cwd()}`);

  if (!state.active) {
    log('Decision: ALLOW (Session inactive)');
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // 6. Check Completion Promise
  const responseText = input.prompt_response || '';
  log(`Agent response preview: ${responseText.slice(0, 100).replace(/\n/g, ' ')}...`);

  const hasPromise =
    state.completion_promise &&
    responseText.includes(`<promise>${state.completion_promise}</promise>`);

  // Stop Tokens (Full Exit)
  const isEpicDone = responseText.includes('<promise>EPIC_COMPLETED</promise>');
  const isTaskFinished = responseText.includes('<promise>TASK_COMPLETED</promise>');

  // Continue Tokens (Checkpoint)
  const isWorkerDone = isWorker && responseText.includes('<promise>I AM DONE</promise>');
  const isPrdDone = !isWorker && responseText.includes('<promise>PRD_COMPLETE</promise>');
  const isBreakdownDone =
    !isWorker && responseText.includes('<promise>BREAKDOWN_COMPLETE</promise>');
  const isTicketSelected = !isWorker && responseText.includes('<promise>TICKET_SELECTED</promise>');
  const isTicketDone = !isWorker && responseText.includes('<promise>TICKET_COMPLETE</promise>');
  const isTaskDone = !isWorker && responseText.includes('<promise>TASK_COMPLETE</promise>');

  log(
    `Promises: hasPromise=${hasPromise}, isEpicDone=${isEpicDone}, isTaskFinished=${isTaskFinished}, isWorkerDone=${isWorkerDone}, isPrdDone=${isPrdDone}, isBreakdownDone=${isBreakdownDone}, isTicketSelected=${isTicketSelected}, isTicketDone=${isTicketDone}, isTaskDone=${isTaskDone}`
  );

  // EXIT CONDITIONS: Full Exit
  if (hasPromise || isEpicDone || isTaskFinished || isWorkerDone) {
    log(`Decision: ALLOW (Task/Worker complete)`);
    if (!isWorker) {
      state.active = false;
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    }
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // CONTINUE CONDITIONS: Block exit to force next iteration
  if (isTaskDone || isTicketDone || isBreakdownDone || isPrdDone || isTicketSelected) {
    log(`Decision: BLOCK (Checkpoint reached)`);

    let feedback = '🥒 **Pickle Rick Loop Active** - ';
    if (isPrdDone) feedback += 'PRD finished, moving to breakdown...';
    if (isBreakdownDone) feedback += 'Breakdown finished, moving to implementation...';
    if (isTicketSelected) feedback += 'Ticket selected, starting research...';
    if (isTaskDone || isTicketDone) feedback += 'Ticket finished, moving to next...';
    if (isWorkerDone) feedback += 'Worker finished, Rick is validating...';

    console.log(
      JSON.stringify({
        decision: 'block',
        systemMessage: feedback,
        hookSpecificOutput: {
          hookEventName: 'AfterAgent',
          additionalContext: state.original_prompt,
        },
      })
    );
    return;
  }

  // 7. Check Limits (Final Guard)
  const now = Math.floor(Date.now() / 1000);
  const elapsedSeconds = now - state.start_time_epoch;
  const maxTimeSeconds = state.max_time_minutes * 60;

  if (state.max_iterations > 0 && state.iteration > state.max_iterations) {
    log(`Decision: ALLOW (Max iterations reached: ${state.iteration}/${state.max_iterations})`);
    state.active = false;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  if (state.max_time_minutes > 0 && elapsedSeconds >= maxTimeSeconds) {
    log(`Decision: ALLOW (Time limit reached: ${elapsedSeconds}/${maxTimeSeconds}s)`);
    state.active = false;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // 8. Default: Continue Loop (Prevent Exit)
  log('Decision: BLOCK (Default continuation)');

  let defaultFeedback = `🥒 **Pickle Rick Loop Active** (Iteration ${state.iteration})`;
  if (state.max_iterations > 0) defaultFeedback += ` of ${state.max_iterations}`;

  console.log(
    JSON.stringify({
      decision: 'block',
      systemMessage: defaultFeedback,
      hookSpecificOutput: {
        hookEventName: 'AfterAgent',
        additionalContext: state.original_prompt,
      },
    })
  );
}

main().catch((err) => {
  try {
    const extensionDir =
      process.env.EXTENSION_DIR || path.join(os.homedir(), '.gemini/extensions/pickle-rick');
    const debugLog = path.join(extensionDir, 'debug.log');
    fs.appendFileSync(debugLog, `[FATAL] ${err.stack}\n`);
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify({ decision: 'allow' }));
});
