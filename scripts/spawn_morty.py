#!/usr/bin/env python3
"""
Spawn Morty Worker script.

This script handles the execution of worker tasks within the Pickle Rick loop.
It manages subprocess spawning, timeouts, logging, and result reporting.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import shlex

try:
    import pickle_utils as utils
except ImportError:
    # Add script dir to path to find utils if run directly
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import pickle_utils as utils


def parse_arguments():
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Spawn a Morty Worker")
    parser.add_argument("task", help="The task description")
    parser.add_argument("--ticket-id", required=True, help="Ticket ID")
    parser.add_argument("--ticket-path", required=True, help="Path to ticket directory")
    parser.add_argument("--timeout", type=int, default=1200, help="Timeout in seconds")
    parser.add_argument(
        "--output-format",
        choices=["text", "json", "stream-json"],
        default="text",
        help="Output format",
    )
    parser.add_argument("--model", help="Override the model for the worker")
    return parser.parse_args()


def get_ticket_dir(ticket_path):
    """Normalize and return the ticket directory."""
    ticket_dir = ticket_path
    if ticket_dir.endswith(".md") or (
        os.path.exists(ticket_dir) and os.path.isfile(ticket_dir)
    ):
        ticket_dir = os.path.dirname(ticket_dir)

    os.makedirs(ticket_dir, exist_ok=True)
    return ticket_dir


def get_effective_timeout(requested_timeout, ticket_dir):
    """Calculate the clamped timeout based on session limits."""
    effective_timeout = requested_timeout

    # Check parent dir (Manager state) first, then current dir (Worker state resume)
    parent_state = os.path.join(os.path.dirname(ticket_dir), "state.json")
    worker_state = os.path.join(ticket_dir, "state.json")

    timeout_state_path = parent_state if os.path.exists(parent_state) else None
    if not timeout_state_path and os.path.exists(worker_state):
        timeout_state_path = worker_state

    if timeout_state_path:
        try:
            with open(timeout_state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
                max_mins = state.get("max_time_minutes", 0)
                start_epoch = state.get("start_time_epoch", 0)

                if max_mins > 0 and start_epoch > 0:
                    remaining = (max_mins * 60) - (time.time() - start_epoch)
                    if remaining < effective_timeout:
                        effective_timeout = max(10, int(remaining))
                        msg = f"⚠️  Worker timeout clamped: {effective_timeout}s"
                        print(f"{utils.Style.YELLOW}{msg}{utils.Style.RESET}")
        except (json.JSONDecodeError, IOError, KeyError):
            pass
    return effective_timeout


def get_worker_prompt(task, extension_root):
    """Load and format the worker prompt from TOML or fallback."""
    toml_path = os.path.join(extension_root, "commands", "send-to-morty.toml")
    base_prompt = (
        "# **TASK REQUEST**\n$ARGUMENTS\n\n"
        "You are a Morty Worker. Implement the request above."
    )
    try:
        if os.path.exists(toml_path):
            with open(toml_path, "r", encoding="utf-8") as f:
                content = f.read()
                if 'prompt = """' in content:
                    base_prompt = (
                        content.split('prompt = """')[1].split('"""')[0].strip()
                    )
    except (IOError, IndexError):
        msg = "⚠️ Failed to load prompt. Using fallback."
        print(f"{utils.Style.YELLOW}{msg}{utils.Style.RESET}")

    worker_prompt = base_prompt.replace("${extensionPath}", extension_root)
    worker_prompt = worker_prompt.replace("$ARGUMENTS", shlex.quote(task))

    if len(worker_prompt) < 200:
        worker_prompt += (
            f'\n\nTask: "{task}"\n'
            '1. Activate persona: `activate_skill("load-pickle-persona")`.\n'
            "2. Follow 'Rick Loop' philosophy.\n"
            "3. Output: <promise>I AM DONE</promise>"
        )
    return worker_prompt


def construct_worker_command(args, extension_root, worker_prompt):
    """Assemble the gemini command list."""
    includes = [extension_root] + [
        os.path.join(extension_root, d) for d in ["sessions", "jar", "worktrees"]
    ]

    cmd = ["gemini", "-s", "-y"]
    for path in includes:
        cmd.extend(["--include-directories", path])

    if args.output_format != "text":
        cmd.extend(["-o", args.output_format])

    if args.model:
        cmd.extend(["-m", args.model])

    cmd.extend(["-p", worker_prompt])

    if "PICKLE_WORKER_CMD_OVERRIDE" in os.environ:
        cmd = shlex.split(os.environ["PICKLE_WORKER_CMD_OVERRIDE"])
    return cmd


def run_worker_process(cmd, session_log, timeout, worker_state):
    """Execute the worker subprocess and monitor with a spinner."""
    start_time = time.time()
    return_code = 1

    try:
        with open(session_log, "w", buffering=1, encoding="utf-8") as log_file:
            log_file.write(f"CWD: {os.getcwd()}\n")
            log_file.write(f"Command: {' '.join(cmd)}\n")
            log_file.write("-" * 80 + "\n\n")
            log_file.write("--- BEGIN MORTY OUTPUT ---\n")

            env = os.environ.copy()
            env["PICKLE_STATE_FILE"] = worker_state
            env["PYTHONUNBUFFERED"] = "1"

            with subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=os.getcwd(),
                env=env,
            ) as proc:
                spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
                i = 0
                while proc.poll() is None:
                    if time.time() - start_time > timeout:
                        proc.kill()
                        return 124
                    sys.stdout.write(
                        f"\r   {utils.Style.CYAN}{spinner[i % 10]}{utils.Style.RESET} "
                        f"Worker Active... {utils.Style.DIM}"
                        f"[{utils.format_time(int(time.time() - start_time))}]"
                        f"{utils.Style.RESET}\033[K"
                    )
                    sys.stdout.flush()
                    i += 1
                    time.sleep(0.1)
                return_code = proc.poll()
                sys.stdout.write("\r\033[K")
                sys.stdout.flush()
    except (subprocess.SubprocessError, IOError) as err:
        with open(session_log, "a", encoding="utf-8") as f:
            f.write(f"\n\n[ERROR] Script failed: {err}\n")
        return 1
    return return_code


def analyze_and_report(session_log, return_code):
    """Analyze logs and report status to the user."""
    is_success = False
    has_quota_error = False
    if os.path.exists(session_log):
        with open(session_log, "r", encoding="utf-8") as f:
            content = f.read()
            if "--- BEGIN MORTY OUTPUT ---" in content:
                out = content.split("--- BEGIN MORTY OUTPUT ---")[1]
                if "<promise>I AM DONE</promise>" in out:
                    is_success = return_code == 0
            if "TerminalQuotaError" in content or "exhausted your capacity" in content:
                has_quota_error = True

    status_msg = f"exit:{return_code}"
    if has_quota_error:
        status_msg += f" {utils.Style.RED}(QUOTA EXHAUSTED){utils.Style.RESET}"

    utils.print_minimal_panel(
        "Worker Report",
        {"status": status_msg, "validation": "successful" if is_success else "failed"},
        color_name="GREEN" if is_success else "RED",
        icon="🥒",
    )

    if not is_success:
        if has_quota_error:
            msg = "❌ QUOTA ERROR: You hit the rate limit, Morty! Go touch grass."
            print(f"\n{utils.Style.BOLD}{utils.Style.RED}{msg}{utils.Style.RESET}\n")
        sys.exit(1)


def main():
    """Main entry point for spawning a Morty worker."""
    args = parse_arguments()
    ticket_dir = get_ticket_dir(args.ticket_path)
    session_log = os.path.join(ticket_dir, f"worker_session_{os.getpid()}.log")
    effective_timeout = get_effective_timeout(args.timeout, ticket_dir)

    utils.print_minimal_panel(
        "Spawning Morty Worker",
        {
            "Request": args.task,
            "Ticket": args.ticket_id,
            "Format": args.output_format,
            "Timeout": f"{effective_timeout}s (Req: {args.timeout}s)",
            "PID": os.getpid(),
        },
        color_name="CYAN",
        icon="🥒",
    )

    ext_root = os.path.expanduser("~/.gemini/extensions/pickle-rick")
    ret_code = run_worker_process(
        construct_worker_command(
            args, ext_root, get_worker_prompt(args.task, ext_root)
        ),
        session_log,
        effective_timeout,
        os.path.join(ticket_dir, "state.json"),
    )

    analyze_and_report(session_log, ret_code)


if __name__ == "__main__":
    main()
