import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { printMinimalPanel, Style } from './pickle-utils.js';

function run_cmd(cmd: string | string[], options: { cwd?: string; check?: boolean } = {}): string {
  const { cwd, check = true } = options;
  const command = Array.isArray(cmd) ? cmd.join(' ') : cmd;
  try {
    return execSync(command, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error: any) {
    if (check)
      throw new Error(
        `Command failed: ${command}\nError: ${error.stderr?.toString() || error.message}`
      );
    return error.stdout?.toString().trim() || '';
  }
}

export function run_git(cmd: string[], cwd?: string, check: boolean = true): string {
  return run_cmd(['git', ...cmd], { cwd, check });
}

export function get_github_user(): string {
  try {
    return run_cmd('gh api user -q .login');
  } catch {
    try {
      return run_cmd('git config user.name').replace(/\s+/g, '');
    } catch {
      return 'pickle-rick';
    }
  }
}

export function get_branch_name(task_id: string): string {
  const user = get_github_user();
  const lowerId = task_id.toLowerCase();
  const type = ['fix', 'bug', 'patch', 'issue'].some((x) => lowerId.includes(x)) ? 'fix' : 'feat';
  return `${user}/${type}/${task_id}`;
}

export function update_ticket_status(
  ticket_id: string,
  new_status: string,
  session_dir: string
): void {
  // 1. Find the ticket file
  // Search recursively in the session directory
  const find_ticket = (dir: string): string | null => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const res = find_ticket(fullPath);
        if (res) return res;
      } else if (file === `linear_ticket_${ticket_id}.md`) {
        return fullPath;
      }
    }
    return null;
  };

  const ticket_path = find_ticket(session_dir);
  if (!ticket_path) {
    throw new Error(`Ticket linear_ticket_${ticket_id}.md not found in ${session_dir}`);
  }

  // 2. Read and update the frontmatter
  let content = fs.readFileSync(ticket_path, 'utf-8');
  const today = new Date().toISOString().split('T')[0];

  // Update status and updated date
  content = content.replace(/^status:.*$/m, `status: "${new_status}"`);
  content = content.replace(/^updated:.*$/m, `updated: "${today}"`);

  fs.writeFileSync(ticket_path, content);
  console.log(`Successfully updated ticket ${ticket_id} to status "${new_status}"`);
}

// CLI Interface
if (process.argv[1] && path.basename(process.argv[1]).includes('git-utils')) {
  const args = process.argv.slice(2);

  if (args.includes('--update-status')) {
    const idIdx = args.indexOf('--update-status') + 1;
    const ticketId = args[idIdx];
    const status = args[idIdx + 1];
    const sessionDir = args[idIdx + 2];

    if (!ticketId || !status || !sessionDir) {
      console.error('Usage: node git_utils.js --update-status <id> <status> <session_dir>');
      process.exit(1);
    }

    try {
      update_ticket_status(ticketId, status, sessionDir);
    } catch (err: any) {
      console.error(`${Style.RED}Error: ${err.message}${Style.RESET}`);
      process.exit(1);
    }
  }
}
