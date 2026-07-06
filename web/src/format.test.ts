import { describe, it, expect } from 'vitest';
import { formatTokens, formatDuration } from './format.js';

describe('formatTokens', () => {
  it('formats thousands and millions', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(2_300_000)).toBe('2.3M');
  });
});

describe('formatDuration', () => {
  it('formats ms into h/m/s and handles null', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(3_661_000)).toBe('1h 1m');
  });
});
