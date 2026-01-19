#!/usr/bin/env python3
import sys
import os
import subprocess
import platform
import shutil

def main():
    if len(sys.argv) < 2:
        print("Usage: dispatch_hook.py <hook_name> [args...]", file=sys.stderr)
        sys.exit(1)

    hook_name = sys.argv[1]
    extra_args = sys.argv[2:]
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    hooks_dir = os.path.join(os.path.dirname(script_dir), "hooks")
    is_windows = "windows" in platform.system().lower()

    if is_windows:
        script_path = os.path.join(hooks_dir, f"{hook_name}.ps1")
        exe = shutil.which('pwsh') or shutil.which('powershell')
        if not exe:
            print("Error: PowerShell not found.", file=sys.stderr)
            sys.exit(1)
        cmd = [exe, "-ExecutionPolicy", "Bypass", "-File", script_path] + extra_args
    else:
        script_path = os.path.join(hooks_dir, f"{hook_name}.sh")
        cmd = ["bash", script_path] + extra_args

    if not os.path.exists(script_path):
        print(f"Error: Hook script not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    try:
        # Pass stdin/stdout/stderr through
        result = subprocess.run(
            cmd,
            input=sys.stdin.read(),
            text=True,
            capture_output=True
        )
        print(result.stdout, end='')
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
        
    except Exception as e:
        print(f"Dispatcher Error: {e}", file=sys.stderr)
        print('{"decision": "allow"}')
        sys.exit(0)

if __name__ == "__main__":
    main()
