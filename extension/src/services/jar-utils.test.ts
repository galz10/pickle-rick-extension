import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { addToJar } from './jar-utils.js';

vi.mock('node:fs');
vi.mock('./pickle-utils.js', () => ({
  run_cmd: vi.fn(),
  getExtensionRoot: vi.fn(() => '/test-root'),
  Style: { RED: '', RESET: '' },
}));

describe('jar_utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should add a session to the jar', () => {
    const sessionDir = '/sessions/task1';
    const statePath = '/sessions/task1/state.json';
    const prdPath = '/sessions/task1/prd.md';
    const state = { working_dir: '/repo' };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    const result = addToJar(sessionDir);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.copyFileSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('meta.json'),
      expect.any(String)
    );
    expect(result).toContain('jar');
  });
});
