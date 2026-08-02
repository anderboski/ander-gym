import { describe, expect, it } from 'vitest';
import {
  completedToday,
  currentWeekCount,
  daysBetween,
  formatDaysAgo,
  formatElapsed,
  historyFor,
  lastSessionForTraining,
  latestFor,
  nextTraining,
  setCount,
  sortSessions,
  startOfWeek,
  totalVolume,
  weeklyStreak,
} from './derive';
import type { Session, SessionEntry, Training } from './types';

/** Local-time ISO, so tests don't depend on the runner's timezone. */
function at(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

let seq = 0;
function session(startedAt: string, trainingId = 'a', entries: SessionEntry[] = []): Session {
  seq += 1;
  return {
    id: `s${seq}`,
    trainingId,
    trainingLabel: trainingId,
    startedAt,
    savedAt: startedAt,
    entries,
  };
}

const trainings: Training[] = [
  { id: 'shoulder-bicep-tricep', label: 'Shoulder-bicep-tricep', order: 0, exerciseIds: [] },
  { id: 'leg-abs', label: 'Leg-abs', order: 1, exerciseIds: [] },
  { id: 'pecs-back', label: 'Pecs-back', order: 2, exerciseIds: [] },
];

describe('startOfWeek', () => {
  it('anchors to Monday', () => {
    // 2026-08-02 is a Sunday; its week starts Monday 2026-07-27.
    expect(startOfWeek(new Date(2026, 7, 2))).toEqual(new Date(2026, 6, 27));
    // 2026-07-27 is itself a Monday.
    expect(startOfWeek(new Date(2026, 6, 27))).toEqual(new Date(2026, 6, 27));
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween(new Date(2026, 6, 23), new Date(2026, 7, 1))).toBe(9);
    expect(daysBetween(new Date(2026, 7, 1), new Date(2026, 7, 1))).toBe(0);
  });

  it('ignores the time of day', () => {
    expect(daysBetween(new Date(2026, 6, 23, 23, 59), new Date(2026, 6, 24, 0, 1))).toBe(1);
  });

  it('stays whole across a DST transition', () => {
    // European clocks go back on 2026-10-25.
    expect(daysBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2);
  });
});

describe('currentWeekCount', () => {
  const now = new Date(2026, 7, 2, 10); // Sunday

  it('counts sessions from Monday to Sunday inclusive', () => {
    const sessions = [
      session(at(2026, 7, 27)), // Mon, in
      session(at(2026, 7, 30)), // Thu, in
      session(at(2026, 8, 2, 9)), // Sun, in
      session(at(2026, 7, 26, 23, 59)), // previous Sunday, out
    ];
    expect(currentWeekCount(sessions, now)).toBe(3);
  });

  it('excludes the following Monday', () => {
    expect(currentWeekCount([session(at(2026, 8, 3))], now)).toBe(0);
  });

  it('is zero with no history', () => {
    expect(currentWeekCount([], now)).toBe(0);
  });
});

describe('weeklyStreak', () => {
  const now = new Date(2026, 7, 2, 10); // Sunday of week starting Mon 2026-07-27

  /** `n` sessions in the week that starts `weeksBack` weeks before the current one. */
  function week(weeksBack: number, n: number): Session[] {
    return Array.from({ length: n }, (_, i) =>
      session(at(2026, 7, 27 - weeksBack * 7, 9 + i)),
    );
  }

  it('does not break a streak mid-week', () => {
    // Current week has only 1 of 3 so far, but the two prior weeks were complete.
    const sessions = [...week(0, 1), ...week(1, 3), ...week(2, 3)];
    expect(weeklyStreak(sessions, 3, now)).toBe(2);
  });

  it('includes the current week once it meets the goal', () => {
    const sessions = [...week(0, 3), ...week(1, 3)];
    expect(weeklyStreak(sessions, 3, now)).toBe(2);
  });

  it('stops at the first week below goal', () => {
    const sessions = [...week(1, 3), ...week(2, 2), ...week(3, 3)];
    expect(weeklyStreak(sessions, 3, now)).toBe(1);
  });

  it('is zero when nothing qualifies', () => {
    expect(weeklyStreak(week(1, 1), 3, now)).toBe(0);
    expect(weeklyStreak([], 3, now)).toBe(0);
  });

  it('is zero for a non-positive goal', () => {
    expect(weeklyStreak(week(1, 5), 0, now)).toBe(0);
  });
});

describe('nextTraining', () => {
  it('starts at the first training with no history', () => {
    expect(nextTraining(trainings, [])?.id).toBe('shoulder-bicep-tricep');
  });

  it('advances past the last completed training', () => {
    const sessions = [session(at(2026, 8, 1), 'shoulder-bicep-tricep')];
    expect(nextTraining(trainings, sessions)?.id).toBe('leg-abs');
  });

  it('wraps around the end of the rotation', () => {
    const sessions = [session(at(2026, 8, 1), 'pecs-back')];
    expect(nextTraining(trainings, sessions)?.id).toBe('shoulder-bicep-tricep');
  });

  it('uses the most recent session, not the last one in the array', () => {
    const sessions = [
      session(at(2026, 8, 1), 'leg-abs'),
      session(at(2026, 7, 20), 'pecs-back'),
    ];
    expect(nextTraining(trainings, sessions)?.id).toBe('pecs-back');
  });

  it('advances twice when two sessions were done in one day', () => {
    const sessions = [
      session(at(2026, 8, 1, 9), 'shoulder-bicep-tricep'),
      session(at(2026, 8, 1, 18), 'leg-abs'),
    ];
    expect(nextTraining(trainings, sessions)?.id).toBe('pecs-back');
  });

  it('falls back to the first training when the last one no longer exists', () => {
    const sessions = [session(at(2026, 8, 1), 'deleted-training')];
    expect(nextTraining(trainings, sessions)?.id).toBe('shoulder-bicep-tricep');
  });

  it('respects order, not array position', () => {
    const shuffled = [trainings[2]!, trainings[0]!, trainings[1]!];
    const sessions = [session(at(2026, 8, 1), 'shoulder-bicep-tricep')];
    expect(nextTraining(shuffled, sessions)?.id).toBe('leg-abs');
  });

  it('returns null with no trainings', () => {
    expect(nextTraining([], [])).toBeNull();
  });
});

describe('per-exercise history', () => {
  const now = new Date(2026, 7, 1);
  const sessions = [
    session(at(2026, 7, 23), 'a', [{ exerciseId: '0001', sets: [{ reps: 10, weight: 25, at: at(2026, 7, 23) }] }]),
    session(at(2026, 7, 30), 'a', [{ exerciseId: '0001', sets: [] }]), // logged nothing
    session(at(2026, 7, 28), 'a', [
      { exerciseId: '0001', sets: [{ reps: 8, weight: 30, at: at(2026, 7, 28) }] },
      { exerciseId: '0002', sets: [{ reps: 12, weight: 0, at: at(2026, 7, 28) }] },
    ]),
  ];

  it('returns records newest first', () => {
    expect(historyFor('0001', sessions, now).map((r) => r.daysAgo)).toEqual([4, 9]);
  });

  it('skips sessions where the exercise was present but never logged', () => {
    expect(historyFor('0001', sessions, now)).toHaveLength(2);
  });

  it('latestFor picks the most recent logged occurrence', () => {
    const latest = latestFor('0001', sessions, now);
    expect(latest?.daysAgo).toBe(4);
    expect(latest?.sets).toEqual([{ reps: 8, weight: 30, at: at(2026, 7, 28) }]);
  });

  it('returns null for an exercise never logged', () => {
    expect(latestFor('9999', sessions, now)).toBeNull();
    expect(historyFor('9999', sessions, now)).toEqual([]);
  });
});

describe('session summaries', () => {
  const s = session(at(2026, 8, 1), 'a', [
    { exerciseId: '0001', sets: [{ reps: 10, weight: 25, at: '' }, { reps: 8, weight: 30, at: '' }] },
    { exerciseId: '0002', sets: [{ reps: 12, weight: 0, at: '' }] },
  ]);

  it('counts sets across exercises', () => {
    expect(setCount(s)).toBe(3);
  });

  it('sums volume, treating bodyweight as zero', () => {
    expect(totalVolume(s)).toBe(10 * 25 + 8 * 30);
  });
});

describe('ordering and today', () => {
  it('sorts newest first', () => {
    const list = [session(at(2026, 7, 20)), session(at(2026, 8, 1)), session(at(2026, 7, 25))];
    expect(sortSessions(list).map((s) => s.startedAt)).toEqual([
      at(2026, 8, 1),
      at(2026, 7, 25),
      at(2026, 7, 20),
    ]);
  });

  it('detects a session completed today', () => {
    const now = new Date(2026, 7, 1, 20);
    expect(completedToday([session(at(2026, 8, 1, 9))], now)).not.toBeNull();
    expect(completedToday([session(at(2026, 7, 31, 23))], now)).toBeNull();
  });

  it('finds the last session for one training', () => {
    const sessions = [
      session(at(2026, 8, 1), 'leg-abs'),
      session(at(2026, 7, 20), 'pecs-back'),
      session(at(2026, 7, 28), 'pecs-back'),
    ];
    expect(lastSessionForTraining('pecs-back', sessions)?.startedAt).toBe(at(2026, 7, 28));
    expect(lastSessionForTraining('nope', sessions)).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats days back', () => {
    expect(formatDaysAgo(0)).toBe('today');
    expect(formatDaysAgo(1)).toBe('-1 day');
    expect(formatDaysAgo(9)).toBe('-9 days');
  });

  it('formats elapsed time', () => {
    const start = at(2026, 8, 1, 10, 0);
    expect(formatElapsed(start, new Date(2026, 7, 1, 10, 24))).toBe('24m');
    expect(formatElapsed(start, new Date(2026, 7, 1, 11, 12))).toBe('1h 12m');
  });
});
