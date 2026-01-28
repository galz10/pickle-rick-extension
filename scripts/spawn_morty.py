#!/usr/bin/env python3
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

def main():
    parser = argparse.ArgumentParser(description="Spawn a Morty Worker")
    parser.add_argument("task", help="The task description")
    parser.add_argument("--ticket-id", required=True, help="Ticket ID")
    parser.add_argument("--ticket-path", required=True, help="Path to ticket directory")
    parser.add_argument("--timeout", type=int, default=1200, help="Timeout in seconds")
    parser.add_argument("--output-format", choices=["text", "json", "stream-json"], default="text", help="Output format")

    args = parser.parse_args()

    # Normalize path
    ticket_dir = args.ticket_path
    if ticket_dir.endswith(".md") or (os.path.exists(ticket_dir) and os.path.isfile(ticket_dir)):
        ticket_dir = os.path.dirname(ticket_dir)

    os.makedirs(ticket_dir, exist_ok=True)
    session_log = os.path.join(ticket_dir, f"worker_session_{os.getpid()}.log")

    # --- Timeout Logic ---
    effective_timeout = args.timeout
    
    # Check parent dir (Manager state) first, then current dir (Worker state resume)
    timeout_state_path = None
    parent_state = os.path.join(os.path.dirname(ticket_dir), "state.json")
    worker_state = os.path.join(ticket_dir, "state.json")

    if os.path.exists(parent_state):
        timeout_state_path = parent_state
    elif os.path.exists(worker_state):
        timeout_state_path = worker_state

    if timeout_state_path:
        try:
            with open(timeout_state_path, "r") as f:
                state = json.load(f)
                max_mins = state.get("max_time_minutes", 0)
                start_epoch = state.get("start_time_epoch", 0)

                if max_mins > 0 and start_epoch > 0:
                    remaining = (max_mins * 60) - (time.time() - start_epoch)
                    if remaining < effective_timeout:
                        effective_timeout = max(10, int(remaining))
                        print(f"{utils.Style.YELLOW}⚠️  Worker timeout clamped: {effective_timeout}s{utils.Style.RESET}")
        except Exception:
            pass

    # Initial Output
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

    # Sandbox Includes
    extension_root = os.path.expanduser("~/.gemini/extensions/pickle-rick")
    includes = [extension_root] + [os.path.join(extension_root, d) for d in ["sessions", "jar", "worktrees"]]

    cmd = ["gemini", "-y"]
    for path in includes:
        cmd.extend(["--include-directories", path])

    if args.output_format != "text":
        cmd.extend(["-o", args.output_format])

    # Prompt Construction
    toml_path = os.path.expanduser("~/.gemini/extensions/pickle-rick/commands/send-to-morty.toml")
    base_prompt = '# **TASK REQUEST**\n$ARGUMENTS\n\nYou are a Morty Worker. Implement the request above.'
    try:
        if os.path.exists(toml_path):
            with open(toml_path, "r") as f:
                content = f.read()
                if 'prompt = """' in content:
                    base_prompt = content.split('prompt = """')[1].split('"""')[0].strip()
    except Exception as e:
        print(f"{utils.Style.YELLOW}⚠️ Failed to load prompt: {e}. Using fallback.{utils.Style.RESET}")

    worker_prompt = base_prompt.replace("${extensionPath}", extension_root)
    worker_prompt = worker_prompt.replace("$ARGUMENTS", shlex.quote(args.task))

    if len(worker_prompt) < 200:
        worker_prompt += (
            f'\n\nTask: "{args.task}"\n'
            '1. Activate persona: `activate_skill("load-pickle-persona")`.\n'
            "2. Follow 'Rick Loop' philosophy.\n"
            "3. Output: <promise>I AM DONE</promise>"
        )

    cmd.extend(["-p", worker_prompt])

    if "PICKLE_WORKER_CMD_OVERRIDE" in os.environ:
        cmd = shlex.split(os.environ["PICKLE_WORKER_CMD_OVERRIDE"])

    start_time = time.time()
    return_code = 1
    
    try:
        with open(session_log, "w", buffering=1) as log_file:
            log_file.write(f"CWD: {os.getcwd()}\n")
            log_file.write(f"Command: {' '.join(cmd)}\n")
            log_file.write("-" * 80 + "\n\n")

            env = os.environ.copy()
            env["PICKLE_STATE_FILE"] = worker_state
            env["PYTHONUNBUFFERED"] = "1"

            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=os.getcwd(),
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

                if time.time() - start_time > effective_timeout:
                    process.kill()
                    return_code = 124
                    break

                # Read logs in real-time
                while True:
                    line = log_reader.readline()
                    if not line: break
                    clean = line.strip()
                    if clean and not any(clean.startswith(x) for x in ["Command", "Directory", "Output", "```"]):
                         if len(clean) < 100 and clean[0].isupper():
                            last_line = clean

                disp = last_line[:67] + "..." if len(last_line) > 70 else last_line
                spin_char = spinner[idx % len(spinner)]
                elapsed = int(time.time() - start_time)
                
                # Using sys.stdout.write directly for control
                sys.stdout.write(
                    f"\r   {utils.Style.CYAN}{spin_char}{utils.Style.RESET} Worker Active... {utils.Style.DIM}[{utils.format_time(elapsed)}]{utils.Style.RESET} {disp}\033[K"
                )
                sys.stdout.flush()

                idx += 1
                time.sleep(0.1)
            sys.stdout.write("\r\033[K")
            sys.stdout.flush()
            log_reader.close()

    except Exception as e:
        with open(session_log, "a") as f:
            f.write(f"\n\n[ERROR] Script failed: {e}\n")
        return_code = 1

    is_success = False
    failure_reason = "None"
    
    if os.path.exists(session_log):
        with open(session_log, "r") as f:
            content = f.read()
            if content.count("<promise>I AM DONE</promise>") >= 2:
                is_success = True
            else:
                if return_code == 124:
                    failure_reason = "TIMEOUT"
                elif return_code != 0:
                    failure_reason = f"PROCESS ERROR ({return_code})"
                else:
                    failure_reason = "VALIDATION FAILED (Promise missing)"

    report_fields = {
        "status": f"exit:{return_code}",
        "validation": "successful" if is_success else f"failed ({failure_reason})",
    }

    if not is_success:
        # Include log tail on failure
        try:
            with open(session_log, "r") as f:
                lines = f.readlines()
                tail = [l.strip() for l in lines[-10:] if l.strip()]
                report_fields["last_logs"] = "\n" + "\n".join(tail)
        except:
            pass

    utils.print_minimal_panel(
        "Worker Report",
        report_fields,
        color_name="GREEN" if is_success else "RED",
        icon="🥒",
    )

    if not is_success:
        sys.exit(1)

if __name__ == "__main__":
    main()
