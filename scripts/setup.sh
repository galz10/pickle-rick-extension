#!/bin/bash

# -----------------------------------------------------------------------------
# Pickle Rick: Session Bootstrapper
# -----------------------------------------------------------------------------
# Initializes the recursive development environment.
# -----------------------------------------------------------------------------

set -euo pipefail

# -- Configuration --
ROOT_DIR="$HOME/.gemini/extensions/pickle-rick"
SESSIONS_ROOT="$ROOT_DIR/sessions"
JAR_ROOT="$ROOT_DIR/jar"
WORKTREES_ROOT="$ROOT_DIR/worktrees"
SESSIONS_MAP="$ROOT_DIR/current_sessions.json"

# Ensure core directories exist
mkdir -p "$SESSIONS_ROOT" "$JAR_ROOT" "$WORKTREES_ROOT"

# -- State Variables --
LOOP_LIMIT=""
TIME_LIMIT=""
LOOP_LIMIT_SET="false"
TIME_LIMIT_SET="false"
WORKER_TIMEOUT=""
PROMISE_TOKEN="null"
TASK_ARGS=()
RESUME_MODE="false"
RESUME_PATH=""
RESET_MODE="false"
START_EPOCH=$(date +%s)

# -- Helpers --

die() {
  echo "❌ Error: $1" >&2
  exit 1
}

update_session_map() {
  local cwd="$1"
  local path="$2"
  if [[ ! -f "$SESSIONS_MAP" ]]; then echo "{}" > "$SESSIONS_MAP"; fi
  local tmp_map=$(mktemp)
  if jq --arg cwd "$cwd" --arg path "$path" '.[$cwd] = $path' "$SESSIONS_MAP" > "$tmp_map"; then
    mv "$tmp_map" "$SESSIONS_MAP"
  fi
}

# -- Load User Settings --
DEFAULT_LOOP_LIMIT=5
DEFAULT_TIME_LIMIT=60
DEFAULT_WORKER_TIMEOUT=1200

SETTINGS_FILE="$ROOT_DIR/pickle_settings.json"
if [[ -f "$SETTINGS_FILE" ]]; then
  # Extract values, suppressing errors if keys are missing (defaults to empty, handled below)
  JSON_LOOP=$(jq -r '.default_max_iterations // empty' "$SETTINGS_FILE" 2>/dev/null || true)
  JSON_TIME=$(jq -r '.default_max_time_minutes // empty' "$SETTINGS_FILE" 2>/dev/null || true)
  JSON_TIMEOUT=$(jq -r '.default_worker_timeout_seconds // empty' "$SETTINGS_FILE" 2>/dev/null || true)

  [[ -n "$JSON_LOOP" ]] && DEFAULT_LOOP_LIMIT="$JSON_LOOP"
  [[ -n "$JSON_TIME" ]] && DEFAULT_TIME_LIMIT="$JSON_TIME"
  [[ -n "$JSON_TIMEOUT" ]] && DEFAULT_WORKER_TIMEOUT="$JSON_TIMEOUT"
fi

# -- Argument Parser --

# Workaround for LLM tool invocation passing all args as a single string
if [[ $# -eq 1 ]]; then
  if [[ "$1" =~ ^- ]] || [[ "$1" =~ " --" ]]; then
     eval set -- "$1"
  fi
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-iterations)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || die "Invalid iteration limit: '${2:-}'"
      LOOP_LIMIT="$2"
      LOOP_LIMIT_SET="true"
      shift 2
      ;;
    --max-time)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || die "Invalid time limit: '${2:-}'"
      TIME_LIMIT="$2"
      TIME_LIMIT_SET="true"
      shift 2
      ;;
    --worker-timeout)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || die "Invalid worker timeout: '${2:-}'"
      WORKER_TIMEOUT="$2"
      shift 2
      ;;
    --completion-promise)
      [[ -n "${2:-}" ]] || die "Missing promise text."
      PROMISE_TOKEN="$2"
      shift 2
      ;;
    --resume)
      RESUME_MODE="true"
      if [[ -n "${2:-}" ]] && [[ ! "${2:-}" =~ ^- ]]; then
        RESUME_PATH="$2"
        shift 2
      else
        shift 1
      fi
      ;;
    --reset)
      RESET_MODE="true"
      shift 1
      ;;
    --paused)
      PAUSED_MODE="true"
      shift 1
      ;;
    *)
      TASK_ARGS+=("$1")
      shift
      ;;
  esac
done
TASK_STR="${TASK_ARGS[*]:-}"

# -- Session Setup --

if [[ "$RESUME_MODE" == "true" ]]; then
  # 1. Resolve Path
  if [[ -n "$RESUME_PATH" ]]; then
    FULL_SESSION_PATH="$RESUME_PATH"
  elif [[ -f "$SESSIONS_MAP" ]]; then
    FULL_SESSION_PATH=$(jq -r --arg cwd "$PWD" '.[$cwd] // empty' "$SESSIONS_MAP")
    if [[ -z "$FULL_SESSION_PATH" ]]; then
        die "No active session found for current directory ($PWD)."
    fi
  else
    die "No active sessions found (and no path provided)."
  fi

  # 2. Validate
  [[ -d "$FULL_SESSION_PATH" ]] || die "Session directory not found: $FULL_SESSION_PATH"
  STATE_PATH="$FULL_SESSION_PATH/state.json"
  [[ -f "$STATE_PATH" ]] || die "State file not found in: $FULL_SESSION_PATH"

  # 3. Reactivate Session & Update Limits
  JQ_CMD=".active = true"
  
  if [[ "$LOOP_LIMIT_SET" == "true" ]]; then
     JQ_CMD="$JQ_CMD | .max_iterations = $LOOP_LIMIT"
  fi
  if [[ "$TIME_LIMIT_SET" == "true" ]]; then
     JQ_CMD="$JQ_CMD | .max_time_minutes = $TIME_LIMIT"
  fi
  if [[ "$RESET_MODE" == "true" ]]; then
     JQ_CMD="$JQ_CMD | .iteration = 1 | .start_time_epoch = $START_EPOCH"
  fi

  TMP_STATE=$(mktemp)
  if jq "$JQ_CMD" "$STATE_PATH" > "$TMP_STATE"; then
      mv "$TMP_STATE" "$STATE_PATH"
  else
      die "Failed to update state file."
  fi

  # 4. Refresh config from state for display
  # This ensures we show the *actual* current state
  STATE_CONTENT=$(cat "$STATE_PATH")
  LOOP_LIMIT=$(echo "$STATE_CONTENT" | jq -r '.max_iterations')
  TIME_LIMIT=$(echo "$STATE_CONTENT" | jq -r '.max_time_minutes')
  CURRENT_ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration')
  PROMISE_TOKEN=$(echo "$STATE_CONTENT" | jq -r '.completion_promise // "null"')

  update_session_map "$PWD" "$FULL_SESSION_PATH"

else
  # -- New Session Logic --
  [[ -n "$TASK_STR" ]] || die "No task specified. Run /pickle --help for usage."

  # Apply Defaults if not set
  [[ -z "$LOOP_LIMIT" ]] && LOOP_LIMIT="$DEFAULT_LOOP_LIMIT"
  [[ -z "$TIME_LIMIT" ]] && TIME_LIMIT="$DEFAULT_TIME_LIMIT"
  [[ -z "$WORKER_TIMEOUT" ]] && WORKER_TIMEOUT="$DEFAULT_WORKER_TIMEOUT"
  CURRENT_ITERATION=1

  TODAY=$(date +%Y-%m-%d)
  # Generate a random 8-char hash (4 bytes hex)
  HASH=$(openssl rand -hex 4)
  SESSION_ID="${TODAY}-${HASH}"

  FULL_SESSION_PATH="$SESSIONS_ROOT/$SESSION_ID"
  STATE_PATH="$FULL_SESSION_PATH/state.json"

  mkdir -p "$FULL_SESSION_PATH"
  update_session_map "$PWD" "$FULL_SESSION_PATH"

  # -- JSON Generation --

  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  # Determine initial active state
  INITIAL_ACTIVE="true"
  [[ "${PAUSED_MODE:-false}" == "true" ]] && INITIAL_ACTIVE="false"

  jq -n \
    --argjson active "$INITIAL_ACTIVE" \
    --arg working_dir "$PWD" \
    --arg step "prd" \
    --argjson iteration 1 \
    --argjson max_iterations "$LOOP_LIMIT" \
    --argjson max_time_minutes "$TIME_LIMIT" \
    --argjson worker_timeout_seconds "$WORKER_TIMEOUT" \
    --argjson start_time_epoch "$START_EPOCH" \
    --arg completion_promise "$PROMISE_TOKEN" \
    --arg original_prompt "$TASK_STR" \
    --argjson current_ticket null \
    --argjson history [] \
    --arg started_at "$TIMESTAMP" \
    --arg session_dir "$FULL_SESSION_PATH" \
    '{
      active: $active,
      working_dir: $working_dir,
      step: $step,
      iteration: $iteration,
      max_iterations: $max_iterations,
      max_time_minutes: $max_time_minutes,
      worker_timeout_seconds: $worker_timeout_seconds,
      start_time_epoch: $start_time_epoch,
      completion_promise: (if $completion_promise == "null" then null else $completion_promise end),
      original_prompt: $original_prompt,
      current_ticket: $current_ticket,
      history: $history,
      started_at: $started_at,
      session_dir: $session_dir
    }' > "$STATE_PATH"

fi

# -- User Output --

cat <<EOF
🥒 Pickle Rick Activated!

>> Loop Config:
   Iteration: $CURRENT_ITERATION
   Limit:     $( [[ $LOOP_LIMIT -gt 0 ]] && echo "$LOOP_LIMIT" || echo "∞" )
   Max Time:  ${TIME_LIMIT}m
   Worker TO: ${WORKER_TIMEOUT}s
   Promise:   $( [[ "$PROMISE_TOKEN" != "null" ]] && echo "$PROMISE_TOKEN" || echo "None" )

>> Workspace:
   Path:      $FULL_SESSION_PATH
   State:     $STATE_PATH

>> Directive:
   $TASK_STR

⚠️  WARNING: This loop will continue until the task is complete,
    the iteration limit ($LOOP_LIMIT) is reached, the time limit (${TIME_LIMIT}m) expires, or a promise is fulfilled.
EOF

if [[ "$PROMISE_TOKEN" != "null" ]]; then
  echo ""
  echo "⚠️  STRICT EXIT CONDITION ACTIVE"
  echo "   You must output: <promise>$PROMISE_TOKEN</promise>"
fi
