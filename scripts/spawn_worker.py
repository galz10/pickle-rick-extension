#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess
import sys
import textwrap
import time


# --- UI Styling ---
class Style:
    GREEN = "\033[32m"
    RED = "\033[31m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"
    YELLOW = "\033[33m"
    MAGENTA = "\033[35m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def get_width(max_w=90):
    try:
        cols = shutil.get_terminal_size((80, 20)).columns
        return min(cols - 4, max_w)
    except:
        return 80


def print_minimal_panel(title, fields, color_name="GREEN", icon="🥒"):
    width = get_width()
    c = getattr(Style, color_name)
    r = Style.RESET
    b = Style.BOLD
    d = Style.DIM

    # Header (Borderless)
    if title:
        print(f"\n{c}{icon} {b}{title}{r}")

    # Fields
    max_key_len = max([len(k) for k in fields.keys()]) + 1

    for key, value in fields.items():
        val_width = width - max_key_len - 5
        wrapped_val = textwrap.wrap(str(value), width=val_width)
        if not wrapped_val:
            wrapped_val = [""]

        # First line
        k_str = f"{key}:"
        print(f"  {d}{k_str:<{max_key_len}}{r} {wrapped_val[0]}")

        # Subsequent lines
        for line in wrapped_val[1:]:
            print(f"  {' ':<{max_key_len}} {line}")
    print()  # Spacer


def format_time(seconds):
    m, s = divmod(seconds, 60)
    return f"{m}m {s}s"


def main():
    parser = argparse.ArgumentParser(description="Spawn a Pickle Worker")
    parser.add_argument("task", help="The task description")
    parser.add_argument("--ticket-id", required=True, help="Ticket ID")
    parser.add_argument("--ticket-path", required=True, help="Path to ticket directory")
    parser.add_argument("--timeout", type=int, default=1200, help="Timeout in seconds")
    parser.add_argument(
        "--output-format",
        choices=["text", "json", "stream-json"],
        default="text",
        help="Output format for the Gemini CLI",
    )

    args = parser.parse_args()

    # Normalize path
    ticket_dir = args.ticket_path
    if ticket_dir.endswith(".md") or (
        os.path.exists(ticket_dir) and os.path.isfile(ticket_dir)
    ):
        ticket_dir = os.path.dirname(ticket_dir)

    os.makedirs(ticket_dir, exist_ok=True)
    session_log = os.path.join(ticket_dir, f"worker_session_{os.getpid()}.log")

    # --- Timeout Logic ---
    # Locate main state.json to determine remaining session time
    # Check parent dir (Manager state) first, then current dir (Worker state resume)
    effective_timeout = args.timeout
    worker_state_path = os.path.join(ticket_dir, "state.json")
    timeout_state_path = None

    parent_dir = os.path.dirname(ticket_dir)
    parent_state_path = os.path.join(parent_dir, "state.json")

    if os.path.exists(parent_state_path):
        timeout_state_path = parent_state_path
    elif os.path.exists(worker_state_path):
        timeout_state_path = worker_state_path

    if timeout_state_path:
        try:
            import json

            with open(timeout_state_path, "r") as f:
                state = json.load(f)
                max_mins = state.get("max_time_minutes", 0)
                start_epoch = state.get("start_time_epoch", 0)

                if max_mins > 0 and start_epoch > 0:
                    current_epoch = time.time()
                    elapsed = current_epoch - start_epoch
                    max_seconds = max_mins * 60
                    remaining = max_seconds - elapsed

                    if remaining < effective_timeout:
                        effective_timeout = max(
                            10, int(remaining)
                        )  # Give at least 10s to fail gracefully
                        print(
                            f"{Style.YELLOW}⚠️  Worker timeout clamped to remaining session time: {effective_timeout}s{Style.RESET}"
                        )
        except Exception as e:
            pass  # Fail open if state read fails

    # Initial Output
    print_minimal_panel(
        "Spawning Morty Worker",
        {
            "Task": args.task,
            "Ticket": args.ticket_id,
            "Format": args.output_format,
            "Timeout": f"{effective_timeout}s (Req: {args.timeout}s)",
            "PID": os.getpid(),
        },
        color_name="CYAN",
        icon="🥒",
    )

    cmd = ["gemini", "-s", "-y"]

    if args.output_format != "text":
        cmd.extend(["-o", args.output_format])

    cmd.extend(
        [
            "-p",
            f'Please announce what you are doing. /pickle-worker "{args.task}" --completion-promise "I AM DONE"',
        ]
    )

    if "PICKLE_WORKER_CMD_OVERRIDE" in os.environ:
        import shlex

        cmd = shlex.split(os.environ["PICKLE_WORKER_CMD_OVERRIDE"])

    start_time = time.time()
    return_code = 1

    try:
        # Open with line buffering (buffering=1) to ensure logs are written immediately
        with open(session_log, "w", buffering=1) as log_file:
            # Log the full command for debugging
            log_file.write(f"Command executed: {' '.join(cmd)}\n")
            log_file.write("-" * 80 + "\n\n")

            env = os.environ.copy()
            env["PICKLE_STATE_FILE"] = worker_state_path
            env["PYTHONUNBUFFERED"] = (
                "1"  # Force unbuffered stdout for Python subprocesses
            )

            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=os.getcwd(),
                env=env,
            )

            # Spinner Loop
            spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
            idx = 0

            print(
                f"{Style.DIM}   Starting execution sequence...{Style.RESET}", end="\r"
            )

            while True:
                ret_code = process.poll()
                if ret_code is not None:
                    return_code = ret_code
                    break

                if time.time() - start_time > effective_timeout:
                    process.kill()
                    return_code = 124
                    with open(session_log, "a") as f:
                        f.write("\n\n[TIMEOUT] Worker killed after timeout.\n")
                    break

                # Elapsed time
                elapsed_seconds = int(time.time() - start_time)
                time_str = format_time(elapsed_seconds)
                spin_char = spinner[idx % len(spinner)]

                status_line = f"   {Style.CYAN}{spin_char}{Style.RESET} Worker Active... {Style.DIM}[{time_str}]{Style.RESET}"
                sys.stdout.write(f"\r{status_line}\033[K")
                sys.stdout.flush()

                idx += 1
                time.sleep(0.1)

            # Clear line
            sys.stdout.write("\r\033[K")
            sys.stdout.flush()

    except Exception as e:
        with open(session_log, "a") as f:
            f.write(f"\n\n[ERROR] Script failed: {e}\n")
        return_code = 1

    # Check Results
    is_success = False
    result_snippet = "No output"

    if os.path.exists(session_log):
        with open(session_log, "r") as f:
            content = f.read()
            if "<promise>I AM DONE</promise>" in content:
                is_success = True
                result_snippet = "Worker successfully completed the task."
            else:
                lines = content.strip().split("\n")
                result_snippet = lines[-1] if lines else "Empty log"
                # If snippet is too technical, maybe just say check log
                if len(result_snippet) > 80:
                    result_snippet = result_snippet[:77] + "..."

    status_color = "GREEN" if is_success else "RED"

    print_minimal_panel(
        "Worker Report",
        {
            "status": f"exit:{return_code}",
            "validation": "successful" if is_success else "failed",
            "result": result_snippet,
        },
        color_name=status_color,
        icon="🥒",
    )

    # Explicit machine-readable status line for LLM parsing
    print(f"status: exit:{return_code} validation: {'successful' if is_success else 'failed'}")

    if not is_success:
        sys.exit(1)


if __name__ == "__main__":
    main()
