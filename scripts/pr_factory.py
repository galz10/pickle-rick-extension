#!/usr/bin/env python3
import os
import sys
import argparse

try:
    import pickle_utils as utils
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils

def create_pr(repo_path, branch, task_id, approved=False):
    """Pushes the branch and creates a PR via gh."""
    
    # 1. Prepare Content
    body_file = os.path.join(repo_path, "pr_body.md")
    if not os.path.exists(body_file):
        print(f"Warning: pr_body.md not found. Creating a generic body.")
        with open(body_file, "w") as f:
            f.write(f"Autonomous implementation of task {task_id}.\n")

    title_file = os.path.join(repo_path, "pr_title.txt")
    if os.path.exists(title_file):
        with open(title_file, "r") as f:
            title = f.read().strip()
    else:
        title = f"feat: Autonomous task {task_id}"

    # 2. Logic Split
    if not approved:
        print(f"{utils.Style.YELLOW}⚠️  PR Creation NOT Approved (--pr-approved missing).{utils.Style.RESET}")
        print(f"Drafting PR content to local files only.")
        
        # Append to PRD.md as requested
        prd_path = os.path.join(repo_path, "PRD.md") # Assuming PRD.md is in root or check casing
        if not os.path.exists(prd_path): prd_path = os.path.join(repo_path, "prd.md")
        
        with open(body_file, "r") as f:
            body_content = f.read()

        with open(prd_path, "a") as f:
            f.write(f"\n\n# Generated Pull Request\n\n")
            f.write(f"**Title:** {title}\n\n")
            f.write(f"**Branch:** {branch}\n\n")
            f.write(body_content)
            
        print(f"{utils.Style.GREEN}✅ PR Draft appended to {prd_path}{utils.Style.RESET}")
        print(f"Worktree is kept alive at: {repo_path}")
        return

    # 3. Push & Publish (Approved Mode)
    remotes = utils.run_cmd(["git", "remote"], cwd=repo_path, capture=True)
    if not remotes:
        raise RuntimeError("No git remotes found. Cannot push or create PR.")
    
    remote = "origin" if "origin" in remotes else remotes.split("\n")[0]
    
    print(f"Pushing branch {branch} to {remote}...")
    utils.run_cmd(["git", "push", "-u", remote, branch], cwd=repo_path)
    
    print(f"Creating Pull Request: {title}...")
    utils.run_cmd([
        "gh", "pr", "create", 
        "--title", title, 
        "--body-file", body_file
    ], cwd=repo_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pickle PR Factory")
    parser.add_argument("--repo", required=True, help="Path to repository")
    parser.add_argument("--branch", required=True, help="Feature branch name")
    parser.add_argument("--id", required=True, help="Task ID")
    parser.add_argument("--approved", action="store_true", help="Actually create the PR on GitHub")

    args = parser.parse_args()

    try:
        create_pr(args.repo, args.branch, args.id, args.approved)
        if args.approved:
            print("Successfully created Pull Request.")
    except Exception as e:
        print(f"PR Creation Failed: {e}", file=sys.stderr)
        sys.exit(1)
