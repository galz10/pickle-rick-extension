#!/bin/bash

# Check Limit Hook for Pickle Rick
# Blocks the model if time or iteration limits are reached.

set -euo pipefail

# --- Configuration ---
EXTENSION_DIR="${EXTENSION_DIR:-$HOME/.gemini/extensions/pickle-rick}"
CURRENT_SESSION_POINTER="$EXTENSION_DIR/current_session_path"
DEBUG_LOG="$EXTENSION_DIR/debug.log"

# --- Helper Functions ---
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CheckLimit] $*" >> "$DEBUG_LOG"
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
    STATE_FILE="$EXTENSION_DIR/state.json"
  fi
fi

# 3. Check if loop is active
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# 4. Read State
STATE_CONTENT=$(cat "$STATE_FILE" 2>/dev/null || echo "{}")
ACTIVE=$(echo "$STATE_CONTENT" | jq -r '.active // false')

# 4a. Check Working Directory Context
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

if [[ "$ACTIVE" != "true" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration // 0')
MAX_ITERATIONS=$(echo "$STATE_CONTENT" | jq -r '.max_iterations // 0')
MAX_TIME_MINS=$(echo "$STATE_CONTENT" | jq -r '.max_time_minutes // 0')
START_TIME=$(echo "$STATE_CONTENT" | jq -r '.start_time_epoch // 0')

# Sanity Check: Ensure START_TIME is valid
if [[ "$START_TIME" -le 0 ]]; then
  log "Warning: Invalid start time ($START_TIME). Allowing."
  echo '{"decision": "allow"}'
  exit 0
fi

# 5. Check Termination Conditions

# 5a. Time Limit
CURRENT_TIME=$(date +%s)
ELAPSED_SECONDS=$((CURRENT_TIME - START_TIME))
MAX_TIME_SECONDS=$((MAX_TIME_MINS * 60))

# 5c. Jar Completion
JAR_COMPLETE=$(echo "$STATE_CONTENT" | jq -r '.jar_complete // false')
if [[ "$JAR_COMPLETE" == "true" ]]; then
  log "Jar processing complete. Blocking model."
  echo '{"decision":"deny","continue": false,"reason": "Jar processing complete", "stopReason": "Jar processing complete"}'
  exit 0
fi

if [[ "$MAX_TIME_MINS" -gt 0 ]] && [[ "$ELAPSED_SECONDS" -ge "$MAX_TIME_SECONDS" ]]; then
  log "Time limit reached. Blocking model."
  echo '{"decision":"deny","continue": false,"reason": "Time limit exceeded", "stopReason": "Time limit exceeded"}'
  exit 0
fi

# 5b. Max Iterations
if [[ "$MAX_ITERATIONS" -gt 0 ]] && [[ "$ITERATION" -gt "$MAX_ITERATIONS" ]]; then
  log "Max iterations reached ($ITERATION > $MAX_ITERATIONS). Blocking model."
  echo '{"decision":"deny","continue": false,"reason": "Iteration limit exceeded", "stopReason": "Iteration limit exceeded"}'
  exit 0
fi

# 6. Allow continuation
echo '{"decision": "allow"}'
