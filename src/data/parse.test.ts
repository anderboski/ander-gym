import { describe, expect, it } from 'vitest';
import { formatSet, formatWeight } from './parse';

describe('formatting', () => {
  it('formats a weighted set', () => {
    expect(formatSet(10, 25)).toBe('10x25kg');
    expect(formatSet(8, 22.5)).toBe('8x22.5kg');
  });

  it('formats a bodyweight set without a weight', () => {
    expect(formatSet(12, 0)).toBe('12 reps');
  });

  it('trims float noise from weights', () => {
    expect(formatWeight(25.0)).toBe('25');
    expect(formatWeight(22.5)).toBe('22.5');
  });
});
