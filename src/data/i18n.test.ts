import { describe, expect, it } from 'vitest';
import { interpolate } from './i18n';

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
