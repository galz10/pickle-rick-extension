import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { cancelSession } from './cancel.js';

vi.mock('node:fs');
vi.mock('../services/pickle-utils.js', () => ({
  printMinimalPanel: vi.fn(),
  getExtensionRoot: vi.fn(() => '/test-root'),
}));

describe('cancel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should set active to false in state.json', () => {
    const cwd = '/test-dir';
    const sessionPath = '/test-session';
    const statePath = '/test-session/state.json';
    const sessionsMap = { [cwd]: sessionPath };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sessionsMap));
    // Second read for state.json
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(sessionsMap))
      .mockReturnValueOnce(JSON.stringify({ active: true }));

    cancelSession(cwd);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      statePath,
      expect.stringContaining('"active": false')
    );
  });
});
