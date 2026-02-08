import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { getSessionPath } from './get-session.js';

vi.mock('node:fs');
vi.mock('../services/pickle-utils.js', () => ({
  getExtensionRoot: vi.fn(() => '/test-root'),
}));

describe('get_session', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return the session path for the current cwd', () => {
    const cwd = '/test-dir';
    const sessionPath = '/test-session';
    const sessionsMap = { [cwd]: sessionPath };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sessionsMap));

    const result = getSessionPath(cwd);
    expect(result).toBe(sessionPath);
  });

  it('should return null if no session map exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = getSessionPath('/test-dir');
    expect(result).toBeNull();
  });
});
