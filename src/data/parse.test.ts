import { describe, expect, it } from 'vitest';
import {
  firstGrapheme,
  formatCompact,
  formatKg,
  formatKgDelta,
  formatSet,
  formatWeight,
  parseRestSeconds,
  summariseSets,
} from './parse';
import { REST_MAX_SECONDS, REST_MIN_SECONDS } from './types';
import type { SetEntry } from './types';

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

  it('formats a kilogram figure to a tenth, with an explicit sign for deltas', () => {
    expect(formatKg(77.94)).toBe('77.9 kg');
    expect(formatKg(80)).toBe('80 kg');
    expect(formatKgDelta(2.5)).toBe('+2.5 kg');
    expect(formatKgDelta(-0.5)).toBe('-0.5 kg');
    expect(formatKgDelta(0)).toBe('0 kg');
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

describe('summariseSets', () => {
  const set = (reps: number, weight: number): SetEntry => ({ reps, weight, at: '2026-08-01T10:00:00.000Z' });

  it('joins every set when they fit under the cap', () => {
    expect(summariseSets([set(10, 25), set(8, 25)], 3)).toEqual({
      text: '10x25kg \u00b7 8x25kg',
      more: 0,
    });
  });

  it('keeps the first sets in logged order and counts the rest', () => {
    const sets = [set(12, 20), set(10, 25), set(8, 30), set(6, 32.5), set(5, 35)];
    expect(summariseSets(sets, 3)).toEqual({ text: '12x20kg \u00b7 10x25kg \u00b7 8x30kg', more: 2 });
  });

  it('renders a bodyweight set as reps', () => {
    expect(summariseSets([set(15, 0)], 3)).toEqual({ text: '15 reps', more: 0 });
  });

  it('is empty for an exercise with no sets', () => {
    expect(summariseSets([], 3)).toEqual({ text: '', more: 0 });
  });
});
