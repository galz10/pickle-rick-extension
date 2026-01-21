#!/bin/bash
set -e

# Function to check version
check_version() {
  local cmd="$1"
  if ! command -v "$cmd" &> /dev/null; then
    return 1
  fi
  local ver
  ver=$("$cmd" -c 'import sys; print(sys.version_info.major)' 2>/dev/null)
  if [[ "$ver" == "3" ]]; then
    command -v "$cmd"
    return 0
  fi
  return 1
}

# 1. Try python3 explicitly
if check_version "python3"; then
  exit 0
fi

# 2. Try python fallback
if check_version "python"; then
  exit 0
fi

echo "❌ Error: Python 3 not found." >&2
exit 1
