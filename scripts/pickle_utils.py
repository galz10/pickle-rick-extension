#!/usr/bin/env python3
import shutil
import textwrap
import subprocess
import sys
import os

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
    c = getattr(Style, color_name, Style.GREEN)
    r = Style.RESET
    b = Style.BOLD
    d = Style.DIM

    # Header (Borderless)
    if title:
        print(f"\n{c}{icon} {b}{title}{r}")

    # Fields
    if not fields:
        print()
        return

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

def print_banner(text, color_name="CYAN"):
    c = getattr(Style, color_name, Style.CYAN)
    r = Style.RESET
    b = Style.BOLD
    print(f"\n{b}{c}{'='*60}{r}")
    print(f"{b}{c}  {text}{r}")
    print(f"{b}{c}{'='*60}{r}\n")

def format_time(seconds):
    m, s = divmod(seconds, 60)
    return f"{m}m {s}s"

def run_cmd(cmd, cwd=None, check=True, capture=False):
    """Runs a shell command."""
    try:
        result = subprocess.run(
            cmd, 
            cwd=cwd, 
            shell=isinstance(cmd, str),
            check=check, 
            capture_output=capture, 
            text=True
        )
        if capture:
            return result.stdout.strip()
        return result
    except subprocess.CalledProcessError as e:
        if capture:
            print(f"Error running command: {e.stderr}", file=sys.stderr)
        raise
