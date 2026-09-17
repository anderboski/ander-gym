import { describe, expect, it } from 'vitest';
import { interpolate, type TFunc } from './i18n';
import { en } from './translations/en';
import { sportSessionSummary } from './sportLabels';
import type { SportSession } from './types';

/** The real English dictionary, without a React provider. */
const t: TFunc = (key, vars) => interpolate(en[key], vars);

const base = { id: 'ss-1', trainingId: 't', trainingLabel: 'T', date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' };

describe('sportSessionSummary', () => {
  it('names weather and snow for a snowboard day', () => {
    const s: SportSession = { ...base, kind: 'snowboard', weather: 'sunny', snowCondition: 'powder', comments: '' };
    expect(sportSessionSummary(t, s)).toBe('Sunny · Powder');
  });

  it('lists distance, elevation and heart rate for a ride, dropping an unlogged bpm', () => {
    const ride: SportSession = { ...base, kind: 'cycling', distanceKm: 24, elevationM: 460.4, avgBpm: 126.6 };
    expect(sportSessionSummary(t, ride)).toBe('24.0 km · 460 m · 127 bpm');
    expect(sportSessionSummary(t, { ...ride, avgBpm: null })).toBe('24.0 km · 460 m');
  });

  it('totals climbs across grades, with a singular form', () => {
    const climb: SportSession = { ...base, kind: 'climbing', climbsByGrade: { '3': 2, '4': 1, '5': 0 } };
    expect(sportSessionSummary(t, climb)).toBe('3 climbs');
    expect(sportSessionSummary(t, { ...climb, climbsByGrade: { '3': 1, '4': 0, '5': 0 } })).toBe('1 climb');
  });

  it("uses the first line of an 'other' log's notes, or a fallback when empty", () => {
    const other: SportSession = { ...base, kind: 'other', comments: ' Great match \nwith Marta' };
    expect(sportSessionSummary(t, other)).toBe('Great match');
    expect(sportSessionSummary(t, { ...other, comments: '  \n ' })).toBe('Session logged');
  });
});
