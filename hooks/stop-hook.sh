#!/bin/bash

# Stop Hook for Pickle Rick
# Intercepts exit attempts to maintain the iterative loop

set -euo pipefail

# --- Configuration ---
EXTENSION_DIR="${EXTENSION_DIR:-$HOME/.gemini/extensions/pickle-rick}"
CURRENT_SESSION_POINTER="$EXTENSION_DIR/current_session_path"
DEBUG_LOG="$EXTENSION_DIR/debug.log"

# --- Helper Functions ---
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [StopHook] $*" >> "$DEBUG_LOG"
}

# --- Main Execution ---

# 1. Read and Validate Input
INPUT_JSON=$(cat)
if ! echo "$INPUT_JSON" | jq empty > /dev/null 2>&1; then
  log "Error: Invalid JSON input"
  echo '{"decision": "allow"}'
  exit 0
fi

# 2. Determine State File Path
STATE_FILE="${PICKLE_STATE_FILE:-}"
if [[ -z "$STATE_FILE" ]]; then
  SESSION_DIR=$("$EXTENSION_DIR/scripts/get_session.sh" "$PWD" 2>/dev/null || true)
  if [[ -n "$SESSION_DIR" ]]; then
    STATE_FILE="$SESSION_DIR/state.json"
  else
    # Fallback (or no session active)
    STATE_FILE="$EXTENSION_DIR/state.json"
  fi
else
  SESSION_DIR=$(dirname "$STATE_FILE")
fi

# 3. Check if loop is active
if [[ ! -f "$STATE_FILE" ]]; then
  # No state file -> Allow exit
  echo '{"decision": "allow"}'
  exit 0
fi

# 4. Read State using jq
if ! STATE_CONTENT=$(cat "$STATE_FILE" 2>/dev/null); then
    log "Error: Could not read state file"
    echo '{"decision": "allow"}'
    exit 0
fi

ACTIVE=$(echo "$STATE_CONTENT" | jq -r '.active // false')
SESSION_CWD=$(echo "$STATE_CONTENT" | jq -r '.working_dir // empty')

# Debug Log for Context verification
log "Context Check: PWD='$PWD' SESSION_CWD='$SESSION_CWD'"

if [[ -z "$SESSION_CWD" ]]; then
  log "Warning: 'working_dir' missing in state.json. skipping hook."
  echo '{"decision": "allow"}'
  exit 0
fi

if [[ -n "$SESSION_CWD" ]]; then
  # 1. Direct String Comparison
  if [[ "$PWD" != "$SESSION_CWD" ]]; then
    # 2. Physical Path Comparison (handle symlinks)
    PHYSICAL_PWD=$(cd "$PWD" && pwd -P 2>/dev/null || echo "$PWD")
    PHYSICAL_SESSION_CWD=$(cd "$SESSION_CWD" && pwd -P 2>/dev/null || echo "$SESSION_CWD")

    if [[ "$PHYSICAL_PWD" != "$PHYSICAL_SESSION_CWD" ]]; then
      log "CWD Mismatch. Exiting. (PWD: $PHYSICAL_PWD != SESSION: $PHYSICAL_SESSION_CWD)"
      echo '{"decision": "allow"}'
      exit 0
    else
        log "CWD matched via physical path resolution."
    fi
  fi
fi

IS_WORKER=$(echo "$STATE_CONTENT" | jq -r '.worker // false')

# Worker Bypass: Workers (Mortys) should not have an infinite loop enforced by the hook.
# They are managed by the parent process or have their own completion logic.
if [[ "$IS_WORKER" == "true" ]]; then
  log "Worker session detected. Allowing exit."
  echo '{"decision": "allow"}'
  exit 0
fi

if [[ "$ACTIVE" != "true" ]]; then
  # Not active -> Allow exit
  echo '{"decision": "allow"}'
  exit 0
fi

# 5. Parse Loop State
ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration // 1')
MAX_ITERATIONS=$(echo "$STATE_CONTENT" | jq -r '.max_iterations // 0')
MAX_TIME_MINS=$(echo "$STATE_CONTENT" | jq -r '.max_time_minutes // 0')
START_TIME=$(echo "$STATE_CONTENT" | jq -r '.start_time_epoch // 0')
COMPLETION_PROMISE=$(echo "$STATE_CONTENT" | jq -r '.completion_promise // "null"')
ORIGINAL_PROMPT=$(echo "$STATE_CONTENT" | jq -r '.original_prompt // ""')

# 6. Check Termination Conditions

# 6a. Time Limit
CURRENT_TIME=$(date +%s)
ELAPSED_SECONDS=$((CURRENT_TIME - START_TIME))
MAX_TIME_SECONDS=$((MAX_TIME_MINS * 60))

log "Time Check | Elapsed: $ELAPSED_SECONDS / $MAX_TIME_SECONDS (Max Mins: $MAX_TIME_MINS)"

if [[ "$MAX_TIME_MINS" -gt 0 ]] && [[ "$ELAPSED_SECONDS" -ge "$MAX_TIME_SECONDS" ]]; then
  # Time limit reached -> Allow exit
  TMP_STATE=$(mktemp)
  if jq '.active = false' "$STATE_FILE" > "$TMP_STATE"; then
      mv "$TMP_STATE" "$STATE_FILE"
      log "Time limit reached. Stopping loop."
  fi
  echo '{"decision": "allow"}'
  exit 0
fi

# 6b. Max Iterations
if [[ "$MAX_ITERATIONS" -gt 0 ]] && [[ "$ITERATION" -ge "$MAX_ITERATIONS" ]]; then
  # Limit reached -> Allow exit
  TMP_STATE=$(mktemp)
  if jq '.active = false' "$STATE_FILE" > "$TMP_STATE"; then
      mv "$TMP_STATE" "$STATE_FILE"
      log "Max iterations reached ($ITERATION). Stopping loop."
  fi
  echo '{"decision": "allow"}'
  exit 0
fi

# 6c. Completion Promise
# Extract the assistant response from the input. 
# Note: hooks_refrence.md for AfterAgent says 'prompt_response' is the field for the model's response text.
LAST_MESSAGE=$(echo "$INPUT_JSON" | jq -r '.prompt_response // ""')

if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ "$COMPLETION_PROMISE" != "" ]]; then
  if echo "$LAST_MESSAGE" | grep -q "<promise>$COMPLETION_PROMISE</promise>"; then
    # Promise fulfilled -> Allow exit
    TMP_STATE=$(mktemp)
    if jq '.active = false' "$STATE_FILE" > "$TMP_STATE"; then
        mv "$TMP_STATE" "$STATE_FILE"
        log "Completion promise fulfilled. Stopping loop."
    fi
    echo '{"decision": "allow"}'
    exit 0
  fi
fi

# 7. Continue Loop (Prevent Exit)

# Construct Feedback Message
FEEDBACK="🥒 **Pickle Rick Loop Active** (Iteration $ITERATION)"
if [[ "$MAX_ITERATIONS" -gt 0 ]]; then
  FEEDBACK="$FEEDBACK of $MAX_ITERATIONS"
fi

if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ "$COMPLETION_PROMISE" != "" ]]; then
  FEEDBACK="$FEEDBACK\n🎯 Target: <promise>$COMPLETION_PROMISE</promise>"
fi

log "Loop continuing. Blocking exit."

# Output JSON to prevent exit and send new prompt
# We use 'decision: block' to stop the session from ending normally.
# We inject additionalContext to feed back into the agent if supported, or just to log.
jq -n \
  --arg prompt "$ORIGINAL_PROMPT" \
  --arg feedback "$FEEDBACK" \
  '{ 
    "decision": "block",
    "systemMessage": $feedback,
    "hookSpecificOutput": {
      "hookEventName": "AfterAgent",
      "additionalContext": $prompt
    }
  }'
