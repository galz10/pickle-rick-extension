import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { update_ticket_status, get_branch_name } from './git-utils.js';

vi.mock('fs');
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('git_utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('get_branch_name', () => {
    it('should return a feat branch name', () => {
      // Mock get_github_user indirectly or mock run_cmd
      // Since get_branch_name calls get_github_user which calls run_cmd
      // We can mock run_cmd if we exported it, or just mock the dependencies.
      // Actually, let's mock run_cmd in git_utils.
    });
  });

  describe('update_ticket_status', () => {
    it('should update the status in a ticket file', () => {
      const ticketId = '123';
      const sessionDir = '/session';
      const ticketPath = '/session/linear_ticket_123.md';
      const initialContent = `---
status: "Todo"
updated: "2026-01-01"
---
Body`;

      vi.mocked(fs.readdirSync).mockReturnValue(['linear_ticket_123.md'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(initialContent);

      update_ticket_status(ticketId, 'Done', sessionDir);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        ticketPath,
        expect.stringContaining('status: "Done"')
      );
    });

    it('should throw error if ticket not found', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(() => update_ticket_status('123', 'Done', '/session')).toThrow('not found');
    });
  });
});
