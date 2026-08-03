import { describe, expect, it } from 'vitest';
import { formatSet, formatWeight, parseRestSeconds } from './parse';
import { REST_MAX_SECONDS, REST_MIN_SECONDS } from './types';

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

describe('parseRestSeconds', () => {
  it('keeps a sensible duration as-is', () => {
    expect(parseRestSeconds(60)).toBe(60);
    expect(parseRestSeconds(90)).toBe(90);
    expect(parseRestSeconds(120)).toBe(120);
  });

  it('rounds to whole seconds', () => {
    expect(parseRestSeconds(90.4)).toBe(90);
    expect(parseRestSeconds(89.6)).toBe(90);
  });

  it('clamps a usable but silly duration into range', () => {
    expect(parseRestSeconds(5)).toBe(REST_MIN_SECONDS);
    expect(parseRestSeconds(99_999)).toBe(REST_MAX_SECONDS);
  });

  it('rejects anything that could not run a countdown', () => {
    expect(parseRestSeconds(0)).toBeNull();
    expect(parseRestSeconds(-30)).toBeNull();
    expect(parseRestSeconds(NaN)).toBeNull();
    expect(parseRestSeconds(Infinity)).toBeNull();
    expect(parseRestSeconds('90')).toBeNull();
    expect(parseRestSeconds(undefined)).toBeNull();
    expect(parseRestSeconds(null)).toBeNull();
  });
});
