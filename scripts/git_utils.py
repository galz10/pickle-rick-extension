#!/usr/bin/env python3
import os
import sys
import shutil
import argparse

try:
    import pickle_utils as utils
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils

def run_git(cmd, cwd=None, check=True):
    return utils.run_cmd(["git"] + cmd, cwd=cwd, check=check, capture=True)

def get_github_user():
    """Retrieves the GitHub username or git config user."""
    try:
        return utils.run_cmd(["gh", "api", "user", "-q", ".login"], capture=True).strip()
    except:
        try:
            return utils.run_cmd(["git", "config", "user.name"], capture=True).strip().replace(" ", "")
        except:
            return "pickle-rick"

def get_branch_name(task_id):
    """Generates a branch name: user/type/task_id"""
    user = get_github_user()
    lower_id = task_id.lower()
    type_ = "fix" if any(x in lower_id for x in ["fix", "bug", "patch", "issue"]) else "feat"
    return f"{user}/{type_}/{task_id}"

def create_worktree(repo_path, task_id, base_branch=None):
    """Creates a new git worktree in the .worktrees/ subdirectory."""
    # Resolve absolute path for repo
    repo_path = os.path.abspath(repo_path)
    
    # 1. Ensure .worktrees/ is in .gitignore
    gitignore_path = os.path.join(repo_path, ".gitignore")
    content = ""
    if os.path.exists(gitignore_path):
        with open(gitignore_path, "r") as f:
            content = f.read()
    
    if ".worktrees/" not in content:
        print(f"Adding .worktrees/ to .gitignore in {repo_path}")
        with open(gitignore_path, "a") as af:
            if content and not content.endswith("\n"):
                af.write("\n")
            af.write(".worktrees/\n")
    
    # 2. Setup Worktree Path
    worktree_root = os.path.join(repo_path, ".worktrees")
    os.makedirs(worktree_root, exist_ok=True)
    
    worktree_path = os.path.join(worktree_root, f"task-{task_id}")
    new_branch = get_branch_name(task_id)
    
    if base_branch is None:
        try:
            base_branch = run_git(["branch", "--show-current"], cwd=repo_path)
        except:
            base_branch = "main"

    # Cleanup if exists
    if os.path.exists(worktree_path):
        print(f"Worktree path exists, cleaning up: {worktree_path}")
        try:
            run_git(["worktree", "remove", "--force", worktree_path], cwd=repo_path)
        except:
            pass
        if os.path.exists(worktree_path):
             shutil.rmtree(worktree_path)
             run_git(["worktree", "prune"], cwd=repo_path, check=False)

    # Check if branch exists and delete it (we want a fresh start)
    try:
        run_git(["branch", "-D", new_branch], cwd=repo_path)
    except:
        pass 

    print(f"Creating worktree at {worktree_path} (branch: {new_branch})...")
    run_git(["worktree", "add", "-b", new_branch, worktree_path, base_branch], cwd=repo_path)
    return worktree_path

def remove_worktree(worktree_path):
    """Removes a git worktree and prunes metadata."""
    print(f"Removing worktree at {worktree_path}...")
    run_git(["worktree", "remove", "--force", worktree_path], check=False)
    run_git(["worktree", "prune"], check=False)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pickle Rick Git Utils")
    subparsers = parser.add_subparsers(dest="command")

    add_parser = subparsers.add_parser("add")
    add_parser.add_argument("--repo", required=True, help="Path to repo")
    add_parser.add_argument("--id", required=True, help="Task ID")
    add_parser.add_argument("--branch", help="Base branch (defaults to current)")

    remove_parser = subparsers.add_parser("remove")
    remove_parser.add_argument("--path", required=True, help="Worktree path")

    args = parser.parse_args()

    if args.command == "add":
        path = create_worktree(args.repo, args.id, args.branch)
        print(f"Successfully created worktree: {path}")
    elif args.command == "remove":
        remove_worktree(args.path)
        print("Successfully removed worktree.")
    else:
        parser.print_help()