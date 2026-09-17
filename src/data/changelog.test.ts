import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
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

/**
 * The discipline CLAUDE.md asks for — every version bump ships with a
 * changelog entry — enforced rather than remembered. A bump without notes is
 * a "What's new" popup with nothing in it.
 */
describe('CHANGELOG', () => {
  it('ends on the version in package.json', () => {
    expect(CHANGELOG[CHANGELOG.length - 1]?.version).toBe(packageJson.version);
  });

  it('is strictly ascending by version and never goes back in time', () => {
    for (let i = 1; i < CHANGELOG.length; i += 1) {
      const prev = CHANGELOG[i - 1]!;
      const next = CHANGELOG[i]!;
      expect(compareVersions(next.version, prev.version), `${prev.version} -> ${next.version}`).toBeGreaterThan(0);
      expect(next.date >= prev.date, `${prev.version} -> ${next.version}`).toBe(true);
    }
  });

  it('has both languages filled in for every entry', () => {
    for (const entry of CHANGELOG) {
      expect(entry.en.length, entry.version).toBeGreaterThan(0);
      expect(entry.es.length, entry.version).toBe(entry.en.length);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
