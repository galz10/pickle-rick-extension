import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { updateState } from './update-state.js';

vi.mock('node:fs');

describe('update_state', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should update the state file with the given key and value', () => {
    const sessionDir = '/test-session';
    const statePath = '/test-session/state.json';
    const initialState = { step: 'prd', iteration: 1 };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(initialState));

    updateState('step', 'breakdown', sessionDir);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      statePath,
      JSON.stringify({ step: 'breakdown', iteration: 1 }, null, 2)
    );
  });

  it('should throw error if state.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => updateState('key', 'val', '/dir')).toThrow('not found');
  });
});
