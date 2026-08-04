import { describe, expect, it } from 'vitest';
import { firstGrapheme, formatCompact, formatSet, formatWeight, parseRestSeconds } from './parse';
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

  it('compacts axis numbers to four characters', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(840)).toBe('840');
    expect(formatCompact(999.6)).toBe('1000');
    expect(formatCompact(4200)).toBe('4.2k');
    expect(formatCompact(12_400)).toBe('12k');
    expect(formatCompact(-4200)).toBe('-4.2k');
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

describe('firstGrapheme', () => {
  it('keeps a plain letter or symbol as-is', () => {
    expect(firstGrapheme('A')).toBe('A');
    expect(firstGrapheme('*')).toBe('*');
  });

  it('keeps only the first character of a longer string', () => {
    expect(firstGrapheme('push day')).toBe('p');
  });

  it('keeps a multi-codepoint emoji intact, not split mid-sequence', () => {
    // Family: man, woman, girl, boy — several codepoints joined by ZWJ.
    expect(firstGrapheme('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    // Skin-tone modifier.
    expect(firstGrapheme('💪🏽')).toBe('💪🏽');
  });

  it('returns an empty string for empty input', () => {
    expect(firstGrapheme('')).toBe('');
  });
});
