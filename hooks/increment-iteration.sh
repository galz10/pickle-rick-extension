#!/bin/bash

# Increment Iteration Hook
# Runs at BeforeAgent to ensure the iteration counter is updated
# before the agent starts its loop.

set -euo pipefail

# --- Configuration ---
EXTENSION_DIR="${EXTENSION_DIR:-$HOME/.gemini/extensions/pickle-rick}"
CURRENT_SESSION_POINTER="$EXTENSION_DIR/current_session_path"
DEBUG_LOG="$EXTENSION_DIR/debug.log"

# --- Helper Functions ---
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [IncrementIteration] $*" >> "$DEBUG_LOG"
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
  # No state file means not in a pickle loop, just allow
  echo '{"decision": "allow"}'
  exit 0
fi

# 4. Read State and Increment
# Use a separate read to avoid race conditions or file locking issues with jq -i
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

if [[ "$ACTIVE" == "true" ]]; then
  ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration // 0')

  # Validate Iteration is a Number
  if ! [[ "$ITERATION" =~ ^[0-9]+$ ]]; then
    log "Error: Invalid iteration value '$ITERATION'. Resetting to 1."
    ITERATION=0
  fi

  NEXT_ITERATION=$((ITERATION + 1))

  log "Incrementing iteration from $ITERATION to $NEXT_ITERATION"

  TMP_STATE=$(mktemp)
  if jq --argjson iter "$NEXT_ITERATION" '.iteration = $iter' "$STATE_FILE" > "$TMP_STATE"; then
    mv "$TMP_STATE" "$STATE_FILE"
  else
    log "Error: Failed to update state file"
    rm -f "$TMP_STATE"
  fi
fi

# 5. Allow continuation
echo '{"decision": "allow"}'
