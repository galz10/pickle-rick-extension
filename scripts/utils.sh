#!/bin/bash

# -----------------------------------------------------------------------------
# Pickle Rick: Shared Utilities
# -----------------------------------------------------------------------------
# Common helper functions for Pickle Rick scripts.
# -----------------------------------------------------------------------------

# resolve_project_root
#
# Resolves the absolute path of the project root.
# Relies on git to handle standard repos and worktrees correctly.
#
# Usage:
#   ROOT_DIR=$(resolve_project_root) || exit 1
#
resolve_project_root() {
  local root_dir

  if command -v git &> /dev/null; then
    if root_dir=$(git rev-parse --show-toplevel 2>/dev/null); then
      echo "$root_dir"
      return 0
    fi
  fi
  
  # Fallback to PWD
  echo "$PWD"
}

# log_info <message>
log_info() {
    echo "ℹ️  $1" >&2
}

# log_error <message>
log_error() {
    echo "❌ Error: $1" >&2
}

# die <message>
die() {
    log_error "$1"
    exit 1
}
