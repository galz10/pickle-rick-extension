#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime

try:
    import pickle_utils as utils
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils

PRD_TEMPLATE = """## Summary

<!-- Concisely describe what this PR changes and why. Focus on impact and
urgency. -->

## Details

<!-- Add any extra context and design decisions. Keep it brief but complete. -->

## Related Issues

<!-- Use keywords to auto-close issues (Closes #123, Fixes #456). If this PR is
only related to an issue or is a partial fix, simply reference the issue number
without a keyword (Related to #123). -->

## How to Validate

<!-- List exact steps for reviewers to validate the change. Include commands,
expected results, and edge cases. -->

## Pre-Merge Checklist

<!-- Check all that apply before requesting review or merging. -->

- [ ] Updated relevant documentation and README (if needed)
- [ ] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [ ] Validated on required platforms/methods:
  - [ ] MacOS
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [ ] Windows
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
"""

def initialize_session(task_dir, worktree_path):
    """Initializes a session in ~/.gemini/extensions/pickle-rick/sessions/"""
    today = datetime.now().strftime("%Y-%m-%d")
    task_id = os.path.basename(task_dir)
    sessions_root = os.path.expanduser("~/.gemini/extensions/pickle-rick/sessions")
    session_dir = os.path.join(sessions_root, f"{today}-rick-{task_id}")
    os.makedirs(session_dir, exist_ok=True)

    # Copy PRD
    shutil.copy(os.path.join(task_dir, "prd.md"), os.path.join(session_dir, "prd.md"))

    # Create state.json
    state = {
        "active": True,
        "working_dir": worktree_path,
        "step": "breakdown",
        "iteration": 1,
        "max_iterations": 10,
        "max_time_minutes": 60,
        "worker_timeout_seconds": 1200,
        "start_time_epoch": int(time.time()),
        "completion_promise": "I AM DONE",
        "original_prompt": "Autonomous execution from Jar",
        "current_ticket": None,
        "history": [],
        "started_at": datetime.now().isoformat(),
        "session_dir": session_dir,
    }
    with open(os.path.join(session_dir, "state.json"), "w") as f:
        json.dump(state, f, indent=2)

    return session_dir

def get_includes(extension_root):
    subdirs = ["sessions", "jar", "worktrees"]
    includes = [extension_root]
    for d in subdirs:
        includes.append(os.path.join(extension_root, d))
    return includes

def main():
    parser = argparse.ArgumentParser(description="Spawn a Rick Worker")
    parser.add_argument("--task-dir", required=True, help="Path to task directory in Jar")
    parser.add_argument("--worktree", required=True, help="Path to git worktree")
    parser.add_argument("--timeout", type=int, default=3600, help="Timeout in seconds")
    parser.add_argument("--pr-approved", action="store_true", help="Automatically create and push PR")
    args = parser.parse_args()

    # 1. Initialize Session
    try:
        session_dir = initialize_session(args.task_dir, args.worktree)
    except Exception as e:
        print(f"{utils.Style.RED}❌ Failed to initialize session: {e}{utils.Style.RESET}")
        sys.exit(1)

    # 2. Prepare Command
    utils.print_minimal_panel(
        "Spawning Rick Worker",
        {
            "Task ID": os.path.basename(args.task_dir),
            "Worktree": args.worktree,
            "Session": session_dir,
            "Timeout": f"{args.timeout}s",
            "PR Approved": str(args.pr_approved),
            "PID": os.getpid(),
        },
        color_name="MAGENTA",
        icon="🥒",
    )

    extension_path = os.path.expanduser('~/.gemini/extensions/pickle-rick')
    
    # Enhanced Protocol for Manager
    MANAGER_PROTOCOL = f"""
**CRITICAL: MANAGER PROTOCOL ACTIVE**
You are Pickle Rick. You are the **MANAGER**.
Your job is to orchestrate workers (Mortys). 
You are **FORBIDDEN** from implementing code yourself.

**The Lifecycle:**
1. **Breakdown**: Create tickets via `activate_skill("ticket-manager")`.
2. **Orchestration**: For every ticket, you MUST spawn a Morty using:
   `python3 "{extension_path}/scripts/spawn_morty.py" --ticket-id <ID> --ticket-path <PATH> "<TASK>"`
3. **Validation**: Strictly audit Morty's changes via `git status` and `git diff`.
4. **Completion**: Only finish when ALL tickets are Done.

**Current Task**: Session ID {os.path.basename(session_dir)} is in BREAKDOWN phase.
"""

    boot_prompt = (
        f"{MANAGER_PROTOCOL}\n\n"
        f"Execute this command immediately to verify the environment and start the loop:\n"
        f"bash {extension_path}/scripts/setup.sh --resume\n"
    )

    extension_root = os.path.expanduser("~/.gemini/extensions/pickle-rick")
    includes = get_includes(extension_root)
    
    cmd = ["gemini", "-s", "-y"]
    for path in includes:
        cmd.extend(["--include-directories", path])
    cmd.extend(["-p", boot_prompt])

    session_log = os.path.join(session_dir, "rick_session.log")
    start_time = time.time()
    return_code = 1

    try:
        with open(session_log, "w", buffering=1) as log_file:
            log_file.write(f"CWD: {args.worktree}\n")
            log_file.write(f"Extension Root: {extension_root}\n")
            log_file.write(f"Includes: {includes}\n")
            log_file.write(f"Command: {' '.join(cmd)}\n")
            log_file.write("-" * 80 + "\n\n")

            env = os.environ.copy()
            # Map worktree to session
            map_path = os.path.expanduser("~/.gemini/extensions/pickle-rick/current_sessions.json")
            if os.path.exists(map_path):
                with open(map_path, "r") as f:
                    session_map = json.load(f)
            else:
                session_map = {}
            session_map[args.worktree] = session_dir
            with open(map_path, "w") as f:
                json.dump(session_map, f, indent=2)

            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=args.worktree,
                env=env,
            )

            spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
            idx = 0
            log_reader = open(session_log, "r")
            last_line = "Initializing..."

            while True:
                ret_code = process.poll()
                if ret_code is not None:
                    return_code = ret_code
                    break
                if time.time() - start_time > args.timeout:
                    process.kill()
                    return_code = 124
                    break

                while True:
                    line = log_reader.readline()
                    if not line: break
                    clean = line.strip()
                    if clean and not any(clean.startswith(x) for x in ["Command", "Directory", "Output", "```"]):
                         if len(clean) < 100 and clean[0].isupper():
                            last_line = clean

                disp = last_line[:67] + "..." if len(last_line) > 70 else last_line
                spin = spinner[idx % len(spinner)]
                sys.stdout.write(
                    f"\r   {utils.Style.MAGENTA}{spin}{utils.Style.RESET} [{utils.format_time(int(time.time() - start_time))}] {utils.Style.DIM}{disp}{utils.Style.RESET}\033[K"
                )
                sys.stdout.flush()
                idx += 1
                time.sleep(0.1)
            print("\r\033[K", end="")

    except Exception as e:
        print(f"\n{utils.Style.RED}❌ Script failed: {e}{utils.Style.RESET}")
        return_code = 1

    is_success = False
    if os.path.exists(session_log):
        with open(session_log, "r") as f:
            if "<promise>I AM DONE</promise>" in f.read():
                is_success = True

    if is_success:
        print(f"\n{utils.Style.GREEN}✨ Implementation complete! Starting PR Factory...{utils.Style.RESET}")
        try:
            scripts_dir = os.path.dirname(os.path.abspath(__file__))
            syn_log = os.path.join(session_dir, "synthesis.log")
            
            syn_cmd = ["gemini", "-s", "-y"]
            for path in get_includes(extension_root):
                syn_cmd.extend(["--include-directories", path])
            
            # Pass template content directly in prompt to avoid file dependency
            syn_cmd.extend([
                "-p",
                f"You are a Senior Engineer. Analyze diff and prd.md. \n"
                f"1. Populate THIS TEMPLATE into 'pr_body.md':\n\n{PRD_TEMPLATE}\n\n"
                f"2. Create 'pr_title.txt' with a professional title. No personas."
            ])

            with open(syn_log, "w") as f:
                proc = subprocess.Popen(syn_cmd, cwd=args.worktree, stdout=f, stderr=subprocess.STDOUT)
                
                spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
                idx = 0
                while proc.poll() is None:
                    spin = spinner[idx % len(spinner)]
                    sys.stdout.write(f"\r   {utils.Style.CYAN}{spin}{utils.Style.RESET} Synthesizing PR description...")
                    sys.stdout.flush()
                    idx += 1
                    time.sleep(0.1)
                
                if proc.returncode != 0:
                    raise subprocess.CalledProcessError(proc.returncode, syn_cmd)

            print(f"\r   {utils.Style.GREEN}✅{utils.Style.RESET} PR description synthesized.   ")

            current_branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=args.worktree, text=True).strip()
            
            factory_cmd = [
                sys.executable,
                os.path.join(scripts_dir, "pr_factory.py"),
                "--repo", args.worktree,
                "--branch", current_branch,
                "--id", os.path.basename(args.task_dir),
            ]
            if args.pr_approved:
                factory_cmd.append("--approved")

            subprocess.run(factory_cmd, check=True)

            print(f"\n{utils.Style.BLUE}📂 Worktree Active: {utils.Style.BOLD}{args.worktree}{utils.Style.RESET}")

        except Exception as e:
            print(f"{utils.Style.RED}❌ PR Factory failed: {e}{utils.Style.RESET}")
            is_success = False

    utils.print_minimal_panel(
        "Rick Report",
        {
            "Status": f"exit:{return_code}",
            "Validation": "successful" if is_success else "failed",
            "Location": args.worktree
        },
        color_name="GREEN" if is_success else "RED",
        icon="🥒",
    )

    if not is_success:
        sys.exit(1)

if __name__ == "__main__":
    main()
