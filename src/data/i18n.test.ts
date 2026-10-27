import { describe, expect, it } from 'vitest';
import { formatMonthYear, interpolate } from './i18n';

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{count} trainings this week', { count: 3 })).toBe('3 trainings this week');
  });

  it('leaves the template unchanged with no vars', () => {
    expect(interpolate('Settings')).toBe('Settings');
  });

  it('leaves an unmatched placeholder as-is', () => {
    expect(interpolate('{missing} thing', { count: 1 })).toBe('{missing} thing');
  });
});

describe('formatMonthYear', () => {
  it('writes month and year with no connective', () => {
    expect(formatMonthYear('es-ES', new Date(2026, 9, 15))).toBe('octubre 2026');
    expect(formatMonthYear('en-GB', new Date(2026, 7, 5))).toBe('August 2026');
  });
});
