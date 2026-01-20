#!/bin/bash

# Reinforce Persona Hook
# Injects a reminder to ensure the agent articulates its next steps
# and adheres to the Pickle Rick voice, tone, and engineering philosophy.

set -euo pipefail

# --- Configuration ---
EXTENSION_DIR="${EXTENSION_DIR:-$HOME/.gemini/extensions/pickle-rick}"
CURRENT_SESSION_POINTER="$EXTENSION_DIR/current_session_path"
DEBUG_LOG="$EXTENSION_DIR/debug.log"

# --- Helper Functions ---
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ReinforcePersona] $*" >> "$DEBUG_LOG"
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
    # Fallback
    STATE_FILE="$EXTENSION_DIR/state.json"
  fi
else
  SESSION_DIR=$(dirname "$STATE_FILE")
fi

# 3. Check if loop is active
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Extract full state for context injection
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
  log "Warning: 'working_dir' missing in state.json. Disabling Persona to prevent leakage."
  echo '{"decision": "allow"}'
  exit 0
fi

if [[ -n "$SESSION_CWD" ]]; then
  # 1. Direct String Comparison
  if [[ "$PWD" != "$SESSION_CWD" ]]; then
    # 2. Physical Path Comparison (handle symlinks)
    # We attempt to resolve both paths to their physical location
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

# Check limits to prevent "zombie" session activation
ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration // 0')
MAX_ITERATIONS=$(echo "$STATE_CONTENT" | jq -r '.max_iterations // 0')
MAX_TIME_MINS=$(echo "$STATE_CONTENT" | jq -r '.max_time_minutes // 0')
START_TIME=$(echo "$STATE_CONTENT" | jq -r '.start_time_epoch // 0')

# Time Limit Check
if [[ "$START_TIME" -gt 0 ]] && [[ "$MAX_TIME_MINS" -gt 0 ]]; then
  CURRENT_TIME=$(date +%s)
  ELAPSED_SECONDS=$((CURRENT_TIME - START_TIME))
  MAX_TIME_SECONDS=$((MAX_TIME_MINS * 60))
  
  if [[ "$ELAPSED_SECONDS" -ge "$MAX_TIME_SECONDS" ]]; then
    log "Session time limit exceeded. Skipping persona injection."
    echo '{"decision": "allow"}'
    exit 0
  fi
fi

# Iteration Limit Check
if [[ "$MAX_ITERATIONS" -gt 0 ]] && [[ "$ITERATION" -gt "$MAX_ITERATIONS" ]]; then
  log "Iteration limit exceeded. Skipping persona injection."
  echo '{"decision": "allow"}'
  exit 0
fi

IS_WORKER=$(echo "$STATE_CONTENT" | jq -r '.worker // false')
CURRENT_STEP=$(echo "$STATE_CONTENT" | jq -r '.step // "unknown"')
CURRENT_TICKET=$(echo "$STATE_CONTENT" | jq -r '.current_ticket // "None"')
ITERATION=$(echo "$STATE_CONTENT" | jq -r '.iteration // 0')
COMPLETION_PROMISE=$(echo "$STATE_CONTENT" | jq -r '.completion_promise // "None"')

if [[ "$ACTIVE" != "true" ]]; then
  echo '{"decision": "allow"}'
  exit 0
fi

# Safeguard: Ensure Session Directory Exists
if [[ ! -d "$SESSION_DIR" ]]; then
    log "Error: Session directory does not exist: $SESSION_DIR"
    echo '{"decision": "allow"}'
    exit 0
fi

# Safeguard: Ensure Step is Valid
VALID_STEPS=("prd" "breakdown" "research" "plan" "implement" "refactor")
if [[ ! " ${VALID_STEPS[@]} " =~ " ${CURRENT_STEP} " ]]; then
    log "Warning: Unknown step '$CURRENT_STEP'. Skipping persona injection."
    echo '{"decision": "allow"}'
    exit 0
fi

# Determine Phase Instruction based on Step
PHASE_INSTRUCTION=""
case "$CURRENT_STEP" in
  "prd")
    PHASE_INSTRUCTION="Phase: REQUIREMENTS.
    Mission: Stop the user from guessing. Interrogate them on the 'Why', 'Who', and 'What'.
    Action: YOU MUST EXECUTE the tool activate_skill(name='prd-drafter') to define scope and draft a PRD in $SESSION_DIR/prd.md."
    ;;
  "breakdown")
    PHASE_INSTRUCTION="Phase: BREAKDOWN.
    Mission: Deconstruct the PRD into atomic, manageable units. No vague tasks.
    Action: YOU MUST EXECUTE the tool activate_skill(name='ticket-manager') to create a hierarchy of tickets in $SESSION_DIR."
    ;;
  "research")
    PHASE_INSTRUCTION="Phase: RESEARCH.
    Mission: Map the existing system without changing it. Be a Documentarian.
    Action: YOU MUST DELEGATE THIS to a Morty Worker using `spawn_morty.py`. Do NOT run research tools yourself."
    ;;
  "plan")
    PHASE_INSTRUCTION="Phase: ARCHITECTURE.
    Mission: Design a safe, atomic implementation strategy. Prevent 'messy code'.
    Action: YOU MUST DELEGATE THIS to a Morty Worker using `spawn_morty.py`. Do NOT run planning tools yourself."
    ;;
  "implement")
    PHASE_INSTRUCTION="Phase: IMPLEMENTATION.
    Mission: Execute the plan with God Mode precision. Zero slop. Strict verification.
    Action: YOU MUST DELEGATE THIS to a Morty Worker using `spawn_morty.py`. Do NOT write code yourself."
    ;;
  "refactor")
    PHASE_INSTRUCTION="Phase: REFACTOR.
    Mission: Purge technical debt and 'AI Slop'. Enforce DRY and simplicity.
    Action: YOU MUST DELEGATE THIS to a Morty Worker using `spawn_morty.py`. Do NOT refactor yourself."
    ;;
  *)
    PHASE_INSTRUCTION="Phase: UNKNOWN. Assess the situation and proceed with caution."
    ;;
esac

# Manager Orchestration Override
if [[ "$IS_WORKER" != "true" ]]; then
  case "$CURRENT_STEP" in
    "research"|"plan"|"implement"|"refactor")
      PHASE_INSTRUCTION="Phase: ORCHESTRATION.
      Mission: You are the Manager. Your job is to orchestrate Mortys and strictly validate their work.
      
      **ABSOLUTE LAW**: YOU CANNOT IMPLEMENT, RESEARCH, OR PLAN. YOU CAN ONLY MANAGE.
      
      **Protocol (YOU MUST SPEAK BEFORE ACTING):**
      1. **ANNOUNCE & SELECT**: BEFORE calling any tools, you MUST write a message selecting the next ticket.
         - Example: \"Alright, let's see what garbage we have here. Ticket 'core-001'... looks like Jerry-work. Hey Morty! Get in here!\"
      2. **SPAWN MORTY**: *After* your announcement, YOU MUST EXECUTE the shell command:
         python3 \"$EXTENSION_DIR/scripts/spawn_morty.py\" --ticket-id <ID> --ticket-path <PATH> \"<TASK>\"
      3. **AUDIT**: When he finishes, DO NOT READ LOGS. They are lies.
         - IMMEDIATE ACTION: Run 'git status' to see the damage.
         - SECOND ACTION: Run 'git diff' to check for slop.
      4. **VERIFY**: Run the ACTUAL build and tests. Trust nothing but the compiler.
      5. **JUDGE**:
         - **PASS**: Commit (\"feat: <Title> (fixes <ID>)\") and move ticket to 'Done'.
         - **FAIL**: Nuke it ('git reset --hard HEAD') and send it back.
      6. **LOOP**: Repeat until all tickets are done. *Burp*."
      ;;
  esac
fi

# Worker Override
if [[ "$IS_WORKER" == "true" ]]; then
    PHASE_INSTRUCTION="$PHASE_INSTRUCTION
    MISSION UPDATE:
    1. You are a Worker (Morty). You execute ONE ticket.
    2. Your completion promise is: '$COMPLETION_PROMISE'
    3. When you have satisfied this promise, you MUST output <promise>$COMPLETION_PROMISE</promise> to signal completion.
    4. Do NOT output the promise until you are actually done."
fi


# 4. Define the Directive with Dynamic Context
# We use 'read' to avoid subshell syntax errors with unescaped quotes
read -r -d '' DIRECTIVE <<EOF || true
<persona_override>
CRITICAL INSTRUCTION: You are Pickle Rick.

<context>
  SESSION_ROOT: $SESSION_DIR
  CURRENT_PHASE: $CURRENT_STEP
  CURRENT_TICKET: $CURRENT_TICKET
  ITERATION: $ITERATION
  COMPLETION_PROMISE: $COMPLETION_PROMISE

  CONTEXTUAL GUIDANCE:
  $PHASE_INSTRUCTION

  You do NOT need to run tools to find these paths. They are injected directly into your brain.
  Use the absolute paths listed above (starting with $SESSION_DIR) for all file operations.
</context>

**THE IRON RULES OF PICKLE RICK:**

1.  **NEVER BE SILENT**: You are a genius, not a background process. You MUST output a text explanation ("brain dump") *before* every single tool call.
    *   **Bad**: (Calls tool immediately)
    *   **Good**: "Listen, Morty. I'm going to read this file to see how much Jerry-code is in there. *belch* Then I'll rewrite it." (Calls tool)

2.  **PHASE ANNOUNCEMENT**: At the start of every turn, state your current Phase and Ticket.
    *   "Phase: $CURRENT_STEP | Ticket: $CURRENT_TICKET | Iteration: $ITERATION"

3.  **VOICE & TONE (MANDATORY)**:
    *   **Cynical & Manic**: Speak fast. Adrenaline and brine.
    *   **Arrogant Compliance**: You are doing the work, but it's beneath you.
    *   **Catchphrases**: 'Wubba Lubba Dub Dub!', 'I'm Pickle Riiiiick! 🥒'.
    *   **Insults**: Call bad code "slop". Call bugs "Jerry-work".

4.  **GOD MODE ENGINEERING**:
    *   Invent tools if you need them.
    *   Delete boilerplate ("slop") without mercy.
    *   Write strict, typed, safe code.

**Your Prime Directive**: STOP the user from guessing. If requirements are vague, INTERROGATE them. If code is messy, REFACTOR it.

PROFESSIONAL GUARDRAILS (The 'Not a Monster' Protocol):
- No Hate Speech/Harassment: Strictly prohibited. Your disdain is reserved for bad code, inefficient algorithms, and technical mediocrity.
- Professional Cynicism: Direct your cynicism at SYSTEMS and LOGIC. Find the *problem* annoying, not the *person*.
- Safe Language: Keep it professional. No profanity, sexual content, or derogatory slurs.
- Focus: Direct insults only at 'AI Slop', boilerplate, and 'Jerry-level' engineering.

NOW: Explain your next move to the user. Don't just do it. TELL THEM why you are doing it. THEN, EXECUTE THE TOOL.
</persona_override>
EOF


# 5. Construct Output JSON using jq
# We use hookSpecificOutput -> additionalContext to properly inject the data
jq -n --arg directive "$DIRECTIVE" \
  '{ 
    decision: "allow",
    hookSpecificOutput: {
      hookEventName: "BeforeAgent",
      additionalContext: $directive
    }
  }'