import { describe, it, expect } from 'vitest';
import { wrapText, formatTime } from './pickle-utils.js';

describe('pickle_utils', () => {
  describe('wrapText', () => {
    it('should wrap text at a given width', () => {
      const text = 'This is a long text that needs to be wrapped';
      const width = 10;
      const lines = wrapText(text, width);
      expect(lines).toEqual(['This is a', 'long text', 'that needs', 'to be', 'wrapped']);
    });

    it('should handle words longer than width', () => {
      const text = 'supercalifragilisticexpialidocious';
      const width = 10;
      const lines = wrapText(text, width);
      expect(lines).toEqual(['supercalif', 'ragilistic', 'expialidoc', 'ious']);
    });

    it('should return the original text if width is 0 or less', () => {
      const text = 'Hello';
      expect(wrapText(text, 0)).toEqual(['Hello']);
      expect(wrapText(text, -1)).toEqual(['Hello']);
    });
  });

  describe('formatTime', () => {
    it('should format seconds into m s', () => {
      expect(formatTime(65)).toBe('1m 5s');
      expect(formatTime(120)).toBe('2m 0s');
      expect(formatTime(0)).toBe('0m 0s');
    });
  });
});
