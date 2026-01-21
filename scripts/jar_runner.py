#!/usr/bin/env python3
import os
import json
import subprocess
import argparse
from datetime import datetime
import sys

try:
    import pickle_utils as utils
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils

def main():
    parser = argparse.ArgumentParser(description="Pickle Jar Runner")
    parser.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"), help="Jar date to process")
    parser.add_argument("--pr-approved", action="store_true", help="Automatically create and push PR")
    args = parser.parse_args()

    jar_root = os.path.expanduser("~/.gemini/extensions/pickle-rick/jar")
    date_dir = os.path.join(jar_root, args.date)

    if not os.path.exists(date_dir):
        print(f"{utils.Style.YELLOW}⚠️ No jar found for date: {args.date}{utils.Style.RESET}")
        sys.exit(0)

    tasks = sorted([d for d in os.listdir(date_dir) if os.path.isdir(os.path.join(date_dir, d))])
    
    if not tasks:
        print(f"{utils.Style.YELLOW}⚠️ No tasks in the jar for date: {args.date}{utils.Style.RESET}")
        sys.exit(0)

    utils.print_banner(f"Pickle Jar Crunch: Processing tasks for {args.date}")

    scripts_dir = os.path.expanduser("~/.gemini/extensions/pickle-rick/scripts")

    for idx, task_id in enumerate(tasks):
        task_dir = os.path.join(date_dir, task_id)
        meta_path = os.path.join(task_dir, "meta.json")
        
        if not os.path.exists(meta_path):
            print(f"{utils.Style.RED}❌ Skipping {task_id}: meta.json missing{utils.Style.RESET}")
            continue

        with open(meta_path, "r") as f:
            meta = json.load(f)
            
        if meta.get("status") not in ["queued", "marinating"]:
            print(f"{utils.Style.DIM}⏭️  Skipping {task_id}: status is '{meta.get('status')}'{utils.Style.RESET}")
            continue

        repo_path = meta["repo_path"]
        base_branch = meta["branch"]
        
        print(f"{utils.Style.BOLD}[{idx+1}/{len(tasks)}] Crunching Task: {task_id}{utils.Style.RESET}")
        print(f"  Repo: {repo_path}")
        print(f"  Base Branch: {base_branch}")

        worktree_path = ""
        try:
            # 1. Create Worktree
            print(f"  Creating worktree...")
            res = utils.run_cmd(
                [sys.executable, f"{scripts_dir}/git_utils.py", "add", "--repo", repo_path, "--branch", base_branch, "--id", task_id],
                capture=True
            )
            # Extract path from output "Successfully created worktree: <path>"
            worktree_path = res.strip().split(": ")[-1]

            # 2. Spawn Rick
            print(f"  Starting Rick Worker...")
            rick_cmd = [sys.executable, f"{scripts_dir}/spawn_rick.py", "--task-dir", task_dir, "--worktree", worktree_path]
            if args.pr_approved:
                rick_cmd.append("--pr-approved")
            
            utils.run_cmd(rick_cmd)
            
            print(f"{utils.Style.GREEN}✅ Task {task_id} Crunched!{utils.Style.RESET}")

        except Exception as e:
            print(f"{utils.Style.RED}❌ Task {task_id} failed: {e}{utils.Style.RESET}")
            # Write handoff if possible
            handoff_path = os.path.join(task_dir, "handoff.md")
            with open(handoff_path, "w") as f:
                f.write(f"# Handoff: Task {task_id}\n\nTask failed during execution.\nError: {e}\n")
        
        finally:
            # Only clean up if PR was approved/pushed. Otherwise keep it for review.
            if worktree_path and args.pr_approved:
                print(f"  Cleaning up worktree...")
                utils.run_cmd(
                    [sys.executable, f"{scripts_dir}/git_utils.py", "remove", "--path", worktree_path],
                    check=False
                )
            elif worktree_path:
                 print(f"{utils.Style.YELLOW}⚠️  Worktree kept for review: {worktree_path}{utils.Style.RESET}")

        print("-" * 60)

    utils.print_banner("Crunch complete. Wubba Lubba Dub Dub!")

    # Signal completion to the current session's state file if it exists
    try:
        session_res = utils.run_cmd(
            [os.path.expanduser("~/.gemini/extensions/pickle-rick/scripts/get_session.sh")],
            capture=True,
            check=False
        )
        if session_res:
            session_dir = session_res.strip()
            state_path = os.path.join(session_dir, "state.json")
            if os.path.exists(state_path):
                with open(state_path, "r") as f:
                    state = json.load(f)
                state["jar_complete"] = True
                state["active"] = False
                with open(state_path, "w") as f:
                    json.dump(state, f, indent=2)
                print(f"{utils.Style.DIM}Signal: Jar Complete. Session deactivated.{utils.Style.RESET}")
    except Exception as e:
        print(f"{utils.Style.DIM}Warning: Could not signal session completion: {e}{utils.Style.RESET}")

if __name__ == "__main__":
    main()
