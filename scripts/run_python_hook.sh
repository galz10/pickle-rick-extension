#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECT_SCRIPT="$SCRIPT_DIR/detect_python.sh"

if [ ! -f "$DETECT_SCRIPT" ]; then
    echo "Error: detect_python.sh not found at $DETECT_SCRIPT" >&2
    exit 1
fi

PYTHON_EXE=$("$DETECT_SCRIPT")
if [ $? -ne 0 ] || [ -z "$PYTHON_EXE" ]; then
    echo "Error: Failed to detect Python 3." >&2
    exit 1
fi

exec "$PYTHON_EXE" "$@"
