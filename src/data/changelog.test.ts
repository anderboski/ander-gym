import { describe, expect, it } from 'vitest';
import { CHANGELOG, compareVersions, unseenEntries } from './changelog';

describe('compareVersions', () => {
  it('compares per-segment, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
  });

  it('is zero for equal versions', () => {
    expect(compareVersions('1.6.0', '1.6.0')).toBe(0);
  });
});

describe('unseenEntries', () => {
  it('returns only the latest entry when nothing has been seen yet', () => {
    expect(unseenEntries(null)).toEqual(CHANGELOG.slice(-1));
  });

  it('returns entries newer than the given version, oldest first', () => {
    const result = unseenEntries('1.5.0');
    expect(result.map((e) => e.version)).toEqual(
      CHANGELOG.filter((e) => compareVersions(e.version, '1.5.0') > 0).map((e) => e.version),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns nothing once the newest version has been seen', () => {
    const latest = CHANGELOG[CHANGELOG.length - 1]!.version;
    expect(unseenEntries(latest)).toEqual([]);
  });
});
