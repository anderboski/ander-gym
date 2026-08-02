import { describe, expect, it } from 'vitest';
import { bodyParts, bodyPartsLabel, formatSet, formatWeight, parseTrainingDays, slugify } from './parse';

describe('slugify', () => {
  it('lowercases and collapses separators', () => {
    expect(slugify('Shoulder-bicep-tricep')).toBe('shoulder-bicep-tricep');
    expect(slugify('Pecs-back')).toBe('pecs-back');
    expect(slugify('Leg / Abs')).toBe('leg-abs');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('-Pecs-back-')).toBe('pecs-back');
  });
});

describe('bodyParts', () => {
  it('splits and title-cases', () => {
    expect(bodyParts('Shoulder-bicep-tricep')).toEqual(['Shoulder', 'Bicep', 'Tricep']);
    expect(bodyParts('Leg-abs')).toEqual(['Leg', 'Abs']);
  });

  it('drops empty segments from double or trailing hyphens', () => {
    expect(bodyParts('Pecs--back')).toEqual(['Pecs', 'Back']);
    expect(bodyParts('Pecs-back-')).toEqual(['Pecs', 'Back']);
  });

  it('normalises inconsistent casing', () => {
    expect(bodyParts('PECS-bAcK')).toEqual(['Pecs', 'Back']);
  });

  it('renders a display label', () => {
    expect(bodyPartsLabel('Shoulder-bicep-tricep')).toBe('Shoulder · Bicep · Tricep');
  });
});

describe('parseTrainingDays', () => {
  it('parses the real file contents, preserving order', () => {
    // Note: no trailing newline, exactly as data/training_days.txt ships.
    const parsed = parseTrainingDays('Shoulder-bicep-tricep\nLeg-abs\nPecs-back');
    expect(parsed).toEqual([
      { id: 'shoulder-bicep-tricep', label: 'Shoulder-bicep-tricep', order: 0 },
      { id: 'leg-abs', label: 'Leg-abs', order: 1 },
      { id: 'pecs-back', label: 'Pecs-back', order: 2 },
    ]);
  });

  it('ignores blank lines and CRLF, and renumbers order', () => {
    const parsed = parseTrainingDays('A\r\n\r\n  \r\nB\n');
    expect(parsed.map((p) => [p.id, p.order])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('keeps the first of duplicate slugs', () => {
    expect(parseTrainingDays('Leg-abs\nleg abs').map((p) => p.id)).toEqual(['leg-abs']);
  });
});

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
