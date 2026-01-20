#!/usr/bin/env python3
import os
import sys
import json
import shutil
import argparse
from datetime import datetime

try:
    import pickle_utils as utils
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils

def get_branch(repo_path):
    """Gets the current branch name of the repository."""
    try:
        return utils.run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_path, capture=True).strip()
    except:
        return "unknown"

def add_to_jar(session_dir):
    # 1. Read state.json
    state_path = os.path.join(session_dir, "state.json")
    if not os.path.exists(state_path):
        raise FileNotFoundError(f"state.json not found in {session_dir}")

    with open(state_path, "r") as f:
        state = json.load(f)
    
    repo_path = state.get("working_dir")
    if not repo_path:
        raise ValueError("working_dir not found in state.json")

    branch = get_branch(repo_path)
    
    # 2. Check for prd.md
    prd_src = os.path.join(session_dir, "prd.md")
    if not os.path.exists(prd_src):
        raise FileNotFoundError(f"prd.md not found in {session_dir}")
    
    # 3. Setup Jar storage
    today = datetime.now().strftime("%Y-%m-%d")
    session_id = os.path.basename(session_dir)
    jar_root = os.path.expanduser("~/.gemini/extensions/pickle-rick/jar")
    task_dir = os.path.join(jar_root, today, session_id)
    os.makedirs(task_dir, exist_ok=True)
    
    # 4. Copy PRD
    shutil.copy(prd_src, os.path.join(task_dir, "prd.md"))
    
    # 5. Write meta.json
    meta = {
        "repo_path": repo_path,
        "branch": branch,
        "prd_path": "prd.md",
        "created_at": datetime.now().isoformat(),
        "task_id": session_id,
        "status": "marinating"
    }
    with open(os.path.join(task_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    
    # 6. Deactivate the current session to prevent immediate execution
    state["active"] = False
    state["completion_promise"] = "JARRED" # Signal completion
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)

    return task_dir

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pickle Jar Utils")
    subparsers = parser.add_subparsers(dest="command")

    add_parser = subparsers.add_parser("add")
    add_parser.add_argument("--session", required=True, help="Session directory")

    args = parser.parse_args()

    if args.command == "add":
        try:
            path = add_to_jar(args.session)
            print(f"Task successfully jarred at: {path}")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()