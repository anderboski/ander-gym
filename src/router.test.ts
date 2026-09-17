import { describe, expect, it } from 'vitest';
import { parseRoute, tabOf, TAB_PATHS } from './router';

describe('parseRoute', () => {
  it('maps the five tab roots', () => {
    expect(parseRoute('/home')).toEqual({ name: 'home' });
    expect(parseRoute('/exercises')).toEqual({ name: 'exercises' });
    expect(parseRoute('/trainings')).toEqual({ name: 'trainings' });
    expect(parseRoute('/session')).toEqual({ name: 'session' });
    expect(parseRoute('/history')).toEqual({ name: 'history' });
  });

  it('treats the empty hash and unknown paths as Home', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('/nope/what')).toEqual({ name: 'home' });
  });

  it('parses detail routes with a decoded id', () => {
    expect(parseRoute('/trainings/t-abc')).toEqual({ name: 'training', id: 't-abc' });
    expect(parseRoute('/history/ss-1')).toEqual({ name: 'historyDetail', id: 'ss-1' });
    expect(parseRoute('/trainings/a%20b')).toEqual({ name: 'training', id: 'a b' });
  });

  it('ignores trailing slashes', () => {
    expect(parseRoute('/trainings/')).toEqual({ name: 'trainings' });
  });

  it('round-trips every tab path', () => {
    for (const [tab, path] of Object.entries(TAB_PATHS)) {
      expect(parseRoute(path).name).toBe(tab);
    }
  });
});

describe('tabOf', () => {
  it('lights the parent tab for push views', () => {
    expect(tabOf({ name: 'training', id: 'x' })).toBe('trainings');
    expect(tabOf({ name: 'historyDetail', id: 'x' })).toBe('history');
  });

  it('keeps the Home-rooted push views on Home — D1 locks the bar at five tabs', () => {
    expect(tabOf({ name: 'stats' })).toBe('home');
    expect(tabOf({ name: 'profile' })).toBe('home');
    expect(tabOf({ name: 'help' })).toBe('home');
  });

  it('is the identity for a tab root', () => {
    expect(tabOf({ name: 'session' })).toBe('session');
  });
});
