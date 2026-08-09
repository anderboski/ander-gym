import { describe, expect, it } from 'vitest';
import {
  addMonths,
  adjustRest,
  ageFrom,
  allLatestFor,
  allPersonalRecords,
  averageSessionMinutes,
  beatsPersonalRecord,
  bmi,
  completedToday,
  currentWeekCount,
  dayKey,
  daysBetween,
  epley1RM,
  exerciseProgress,
  formatCountdown,
  formatDaysAgo,
  formatDurationEstimate,
  formatElapsed,
  formatShortDate,
  formatShortLocalDate,
  greetingBucket,
  historyFor,
  lastSessionForTraining,
  lastSportSessionForTraining,
  latestFor,
  lifetimeStats,
  mergedHistory,
  monthGrid,
  nextTraining,
  parseLocalDate,
  personalRecords,
  remainingSeconds,
  REST_DONE_MS,
  restPhase,
  restProgress,
  sessionsByDay,
  setCount,
  sortSessions,
  sportSessionsByDay,
  startOfMonth,
  startOfWeek,
  startRest,
  totalVolume,
  UNKNOWN_TARGET,
  volumeByTarget,
  weeklyStreak,
  weeklySummary,
} from './derive';
import type { Session, SessionEntry, SportSession, Training } from './types';

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

let sportSeq = 0;
function sportSession(
  date: string,
  trainingId = 'sport-a',
  kind: SportSession['kind'] = 'cycling',
): SportSession {
  sportSeq += 1;
  const base = { id: `ss${sportSeq}`, trainingId, trainingLabel: trainingId, date, createdAt: `${date}T00:00:00.000Z` };
  if (kind === 'snowboard') {
    return { ...base, kind, weather: 'sunny', snowCondition: 'powder', comments: '' };
  }
  if (kind === 'climbing') {
    return { ...base, kind, climbsByGrade: { '3': 0, '4': 0, '5': 0 } };
  }
  return { ...base, kind, distanceKm: 10, elevationM: 100, avgBpm: null };
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

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight, not UTC', () => {
    expect(parseLocalDate('2026-08-02')).toEqual(new Date(2026, 7, 2));
  });
});

describe('formatShortLocalDate', () => {
  it('formats a bare YYYY-MM-DD without a UTC-parsing day shift', () => {
    expect(formatShortLocalDate('2026-08-02')).toBe('2 Aug');
  });
});

describe('ageFrom', () => {
  it('counts a full year once the birthday has passed this year', () => {
    expect(ageFrom('1990-08-01', new Date(2026, 7, 2))).toBe(36);
  });

  it('has not incremented yet on the exact birthday — same-day counts as passed', () => {
    expect(ageFrom('1990-08-02', new Date(2026, 7, 2))).toBe(36);
  });

  it('has not incremented yet the day before the birthday', () => {
    expect(ageFrom('1990-08-02', new Date(2026, 7, 1))).toBe(35);
  });
});

describe('bmi', () => {
  it('computes kg / m²', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
  });
});

describe('greetingBucket', () => {
  it('buckets by hour', () => {
    expect(greetingBucket(new Date(2026, 7, 2, 5))).toBe('morning');
    expect(greetingBucket(new Date(2026, 7, 2, 11, 59))).toBe('morning');
    expect(greetingBucket(new Date(2026, 7, 2, 12))).toBe('day');
    expect(greetingBucket(new Date(2026, 7, 2, 17, 59))).toBe('day');
    expect(greetingBucket(new Date(2026, 7, 2, 18))).toBe('evening');
    expect(greetingBucket(new Date(2026, 7, 2, 4, 59))).toBe('evening');
    expect(greetingBucket(new Date(2026, 7, 2, 0))).toBe('evening');
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

  it('skips an archived training in the rotation', () => {
    const withArchived = [trainings[0]!, { ...trainings[1]!, archived: true }, trainings[2]!];
    const sessions = [session(at(2026, 8, 1), 'shoulder-bicep-tricep')];
    expect(nextTraining(withArchived, sessions)?.id).toBe('pecs-back');
  });

  it('never returns an archived training as the fallback first', () => {
    const withArchived = [{ ...trainings[0]!, archived: true }, trainings[1]!, trainings[2]!];
    expect(nextTraining(withArchived, [])?.id).toBe('leg-abs');
  });

  it('wraps past a trailing archived training back to the first active one', () => {
    const withArchived = [trainings[0]!, trainings[1]!, { ...trainings[2]!, archived: true }];
    const sessions = [session(at(2026, 8, 1), 'leg-abs')];
    expect(nextTraining(withArchived, sessions)?.id).toBe('shoulder-bicep-tricep');
  });

  it('returns null when every training is archived', () => {
    const allArchived = trainings.map((t) => ({ ...t, archived: true }));
    expect(nextTraining(allArchived, [])).toBeNull();
  });

  it('skips a non-gym training in the rotation', () => {
    const withSport = [trainings[0]!, { ...trainings[1]!, kind: 'cycling' as const }, trainings[2]!];
    const sessions = [session(at(2026, 8, 1), 'shoulder-bicep-tricep')];
    expect(nextTraining(withSport, sessions)?.id).toBe('pecs-back');
  });

  it('never returns a non-gym training as the fallback first', () => {
    const withSport = [{ ...trainings[0]!, kind: 'snowboard' as const }, trainings[1]!, trainings[2]!];
    expect(nextTraining(withSport, [])?.id).toBe('leg-abs');
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

  it('allLatestFor matches latestFor for every exercise in one pass', () => {
    const all = allLatestFor(sessions, now);
    expect(all.get('0001')).toEqual(latestFor('0001', sessions, now));
    expect(all.get('0002')).toEqual(latestFor('0002', sessions, now));
    // Bodyweight sets still count as "logged" here, unlike personal records.
    expect(all.get('0002')?.sets).toEqual([{ reps: 12, weight: 0, at: at(2026, 7, 28) }]);
    // Never-logged exercises are simply absent.
    expect(all.has('9999')).toBe(false);
  });

  it('allLatestFor is empty for no sessions', () => {
    expect(allLatestFor([]).size).toBe(0);
  });
});

describe('personalRecords', () => {
  /** One session containing one exercise, with `[reps, weight]` pairs. */
  function logged(date: string, exerciseId: string, sets: [number, number][]): Session {
    return session(date, 'a', [
      { exerciseId, sets: sets.map(([reps, weight]) => ({ reps, weight, at: date })) },
    ]);
  }

  it('is null with no sessions at all', () => {
    expect(personalRecords('0001', [])).toBeNull();
  });

  it('is null for an exercise that was never logged', () => {
    expect(personalRecords('9999', [logged(at(2026, 7, 1), '0001', [[10, 25]])])).toBeNull();
  });

  it('takes a single session as the record', () => {
    const records = personalRecords('0001', [logged(at(2026, 7, 1), '0001', [[10, 25]])]);
    expect(records?.heaviest).toMatchObject({ reps: 10, weight: 25 });
    expect(records?.byReps.get(10)).toMatchObject({ weight: 25 });
  });

  it('keeps one best per rep count', () => {
    const records = personalRecords('0001', [
      logged(at(2026, 7, 1), '0001', [
        [10, 25],
        [8, 30],
        [10, 27.5],
        [5, 40],
      ]),
    ]);
    expect(records?.heaviest).toMatchObject({ reps: 5, weight: 40 });
    expect([...(records?.byReps ?? [])].map(([reps, s]) => [reps, s.weight])).toEqual([
      [10, 27.5],
      [8, 30],
      [5, 40],
    ]);
  });

  it('spans sessions, regardless of array order', () => {
    const records = personalRecords('0001', [
      logged(at(2026, 7, 20), '0001', [[8, 32]]),
      logged(at(2026, 7, 1), '0001', [[8, 30]]),
      logged(at(2026, 7, 10), '0001', [[5, 45]]),
    ]);
    expect(records?.heaviest).toMatchObject({ reps: 5, weight: 45 });
    expect(records?.byReps.get(8)).toMatchObject({ weight: 32 });
  });

  it('lets the earlier set keep the record on a tie', () => {
    const first = at(2026, 7, 1);
    const records = personalRecords('0001', [
      logged(at(2026, 7, 20), '0001', [[10, 25]]),
      logged(first, '0001', [[10, 25]]),
    ]);
    expect(records?.heaviest.at).toBe(first);
    expect(records?.byReps.get(10)?.at).toBe(first);
  });

  it('ties within one session go to the earlier set too', () => {
    const day = at(2026, 7, 1);
    const s = session(day, 'a', [
      {
        exerciseId: '0001',
        sets: [
          { reps: 10, weight: 25, at: 'first' },
          { reps: 10, weight: 25, at: 'second' },
        ],
      },
    ]);
    expect(personalRecords('0001', [s])?.heaviest.at).toBe('first');
  });

  it('ignores bodyweight sets entirely', () => {
    const bodyweightOnly = [
      logged(at(2026, 7, 1), '0002', [
        [12, 0],
        [15, 0],
      ]),
    ];
    expect(personalRecords('0002', bodyweightOnly)).toBeNull();

    const mixed = personalRecords('0001', [
      logged(at(2026, 7, 1), '0001', [
        [12, 0],
        [10, 20],
      ]),
    ]);
    expect(mixed?.heaviest).toMatchObject({ reps: 10, weight: 20 });
    expect(mixed?.byReps.has(12)).toBe(false);
  });

  it('reads the active session like a saved one', () => {
    const active = {
      startedAt: at(2026, 7, 25),
      entries: [{ exerciseId: '0001', sets: [{ reps: 10, weight: 60, at: at(2026, 7, 25) }] }],
    };
    const records = personalRecords('0001', [logged(at(2026, 7, 1), '0001', [[10, 25]]), active]);
    expect(records?.heaviest.weight).toBe(60);
  });
});

describe('allPersonalRecords', () => {
  it('matches personalRecords for every exercise in one pass', () => {
    const sessions = [
      session(at(2026, 7, 1), 'a', [
        { exerciseId: '0001', sets: [{ reps: 10, weight: 25, at: at(2026, 7, 1) }] },
        { exerciseId: '0002', sets: [{ reps: 12, weight: 0, at: at(2026, 7, 1) }] },
      ]),
      session(at(2026, 7, 8), 'a', [
        { exerciseId: '0001', sets: [{ reps: 8, weight: 30, at: at(2026, 7, 8) }] },
        { exerciseId: '0003', sets: [] },
      ]),
    ];

    const all = allPersonalRecords(sessions);
    expect(all.get('0001')).toEqual(personalRecords('0001', sessions));
    expect(all.get('0001')?.heaviest.weight).toBe(30);
    // Bodyweight-only and never-logged exercises are simply absent.
    expect(all.has('0002')).toBe(false);
    expect(all.has('0003')).toBe(false);
  });

  it('is empty with no sessions', () => {
    expect(allPersonalRecords([]).size).toBe(0);
  });
});

describe('beatsPersonalRecord', () => {
  const records = personalRecords('0001', [
    session(at(2026, 7, 1), 'a', [
      {
        exerciseId: '0001',
        sets: [
          { reps: 10, weight: 25, at: at(2026, 7, 1) },
          { reps: 5, weight: 40, at: at(2026, 7, 1) },
        ],
      },
    ]),
  ]);

  it('accepts a new heaviest set', () => {
    expect(beatsPersonalRecord({ reps: 3, weight: 42.5 }, records)).toBe(true);
  });

  it('accepts a heavier set at a rep count already on record', () => {
    expect(beatsPersonalRecord({ reps: 10, weight: 26 }, records)).toBe(true);
  });

  it('rejects a tie', () => {
    expect(beatsPersonalRecord({ reps: 10, weight: 25 }, records)).toBe(false);
    expect(beatsPersonalRecord({ reps: 5, weight: 40 }, records)).toBe(false);
  });

  it('rejects a lighter set at an unseen rep count — it beat nothing', () => {
    expect(beatsPersonalRecord({ reps: 12, weight: 20 }, records)).toBe(false);
  });

  it('rejects bodyweight sets and the first set of an exercise', () => {
    expect(beatsPersonalRecord({ reps: 20, weight: 0 }, records)).toBe(false);
    expect(beatsPersonalRecord({ reps: 10, weight: 100 }, null)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Progress over time                                                          */
/* -------------------------------------------------------------------------- */

describe('epley1RM', () => {
  it('adds a rep-count bonus to the load', () => {
    expect(epley1RM(1, 100)).toBeCloseTo(103.33);
    expect(epley1RM(10, 30)).toBe(40);
    expect(epley1RM(30, 20)).toBe(40);
  });

  it('is zero for a bodyweight set — there is no load to extrapolate', () => {
    expect(epley1RM(20, 0)).toBe(0);
  });
});

describe('exerciseProgress', () => {
  const now = new Date(2026, 7, 1);

  /** One session logging `[reps, weight]` pairs against exercise `0001`. */
  function logged(date: string, sets: [number, number][]): Session {
    return session(date, 'a', [
      { exerciseId: '0001', sets: sets.map(([reps, weight]) => ({ reps, weight, at: date })) },
    ]);
  }

  const history = (sessions: Session[]) => historyFor('0001', sessions, now);

  it('is empty with no history', () => {
    expect(exerciseProgress([], 'topWeight')).toEqual([]);
    expect(exerciseProgress(history([]), 'e1rm')).toEqual([]);
  });

  it('returns one point per session, oldest first', () => {
    const sessions = [
      logged(at(2026, 7, 10), [[10, 25]]),
      logged(at(2026, 7, 24), [[8, 30]]),
      logged(at(2026, 7, 17), [[10, 27.5]]),
    ];
    expect(exerciseProgress(history(sessions), 'topWeight')).toEqual([
      { at: at(2026, 7, 10), value: 25, set: { reps: 10, weight: 25, at: at(2026, 7, 10) } },
      { at: at(2026, 7, 17), value: 27.5, set: { reps: 10, weight: 27.5, at: at(2026, 7, 17) } },
      { at: at(2026, 7, 24), value: 30, set: { reps: 8, weight: 30, at: at(2026, 7, 24) } },
    ]);
  });

  it('picks the session set that is best under the chosen metric', () => {
    // 5x40 is the heavier set; 15x32 is the better estimated max (48 vs 46.7).
    const sessions = [
      logged(at(2026, 7, 10), [
        [5, 40],
        [15, 32],
      ]),
    ];
    expect(exerciseProgress(history(sessions), 'topWeight')[0]?.set.reps).toBe(5);

    const best = exerciseProgress(history(sessions), 'e1rm')[0];
    expect(best?.set.reps).toBe(15);
    expect(best?.value).toBe(48);
  });

  it('keeps the earlier set on a tie, like a personal record', () => {
    const day = at(2026, 7, 10);
    const s = session(day, 'a', [
      {
        exerciseId: '0001',
        sets: [
          { reps: 10, weight: 25, at: 'first' },
          { reps: 10, weight: 25, at: 'second' },
        ],
      },
    ]);
    expect(exerciseProgress(history([s]), 'topWeight')[0]?.set.at).toBe('first');
  });

  it('skips bodyweight sets, and sessions made only of them', () => {
    const sessions = [
      logged(at(2026, 7, 10), [[20, 0]]),
      logged(at(2026, 7, 17), [
        [20, 0],
        [8, 30],
      ]),
    ];
    const points = exerciseProgress(history(sessions), 'topWeight');
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ at: at(2026, 7, 17), value: 30 });
  });
});

/* -------------------------------------------------------------------------- */
/* Volume and consistency                                                      */
/* -------------------------------------------------------------------------- */

describe('weeklySummary', () => {
  const now = new Date(2026, 7, 2, 10); // Sunday of the week starting Mon 2026-07-27

  /** One session with a single 10 x `weight` kg set. */
  function lifted(date: string, weight: number): Session {
    return session(date, 'a', [
      { exerciseId: '0001', sets: [{ reps: 10, weight, at: date }] },
    ]);
  }

  it('returns the requested number of weeks, oldest first, ending with this one', () => {
    const weeks = weeklySummary([], 4, now);
    expect(weeks.map((w) => w.start)).toEqual([
      new Date(2026, 6, 6).toISOString(),
      new Date(2026, 6, 13).toISOString(),
      new Date(2026, 6, 20).toISOString(),
      new Date(2026, 6, 27).toISOString(),
    ]);
  });

  it('reports empty weeks as zeros rather than dropping them', () => {
    const weeks = weeklySummary([lifted(at(2026, 7, 28), 25)], 3, now);
    expect(weeks.map((w) => w.sessions)).toEqual([0, 0, 1]);
    expect(weeks.map((w) => w.volume)).toEqual([0, 0, 250]);
  });

  it('sums sessions and volume within a week', () => {
    const weeks = weeklySummary(
      [lifted(at(2026, 7, 27), 25), lifted(at(2026, 7, 30), 30), lifted(at(2026, 8, 2, 9), 0)],
      1,
      now,
    );
    expect(weeks[0]).toMatchObject({ sessions: 3, volume: 550 });
  });

  it('splits on the Monday boundary in local time', () => {
    const weeks = weeklySummary(
      [lifted(at(2026, 7, 26, 23, 59), 10), lifted(at(2026, 7, 27, 0, 0), 10)],
      2,
      now,
    );
    expect(weeks.map((w) => w.sessions)).toEqual([1, 1]);
  });

  it('ignores sessions older than the window', () => {
    expect(weeklySummary([lifted(at(2026, 6, 1), 25)], 4, now).map((w) => w.sessions)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('returns nothing for a non-positive window', () => {
    expect(weeklySummary([lifted(at(2026, 7, 28), 25)], 0, now)).toEqual([]);
  });
});

describe('volumeByTarget', () => {
  const now = new Date(2026, 7, 1, 12);

  const catalogue = new Map([
    ['0001', { target: 'pectorals' }],
    ['0002', { target: 'quads' }],
    ['0003', { target: 'abs' }],
  ]);

  /** One session, `[exerciseId, reps, weight]` per set. */
  function mixed(date: string, sets: [string, number, number][]): Session {
    const entries: SessionEntry[] = [];
    for (const [exerciseId, reps, weight] of sets) {
      const entry = entries.find((e) => e.exerciseId === exerciseId);
      if (entry) entry.sets.push({ reps, weight, at: date });
      else entries.push({ exerciseId, sets: [{ reps, weight, at: date }] });
    }
    return session(date, 'a', entries);
  }

  it('is empty with no sessions', () => {
    expect(volumeByTarget([], catalogue, 30, now)).toEqual([]);
  });

  it('aggregates by target, heaviest first', () => {
    const sessions = [
      mixed(at(2026, 7, 30), [
        ['0001', 10, 40],
        ['0001', 8, 40],
        ['0002', 10, 60],
      ]),
      mixed(at(2026, 7, 20), [['0002', 10, 50]]),
    ];
    expect(volumeByTarget(sessions, catalogue, 30, now)).toEqual([
      { target: 'quads', volume: 1100, sets: 2 },
      { target: 'pectorals', volume: 720, sets: 2 },
    ]);
  });

  it('buckets an exercise the catalogue no longer knows', () => {
    const sessions = [mixed(at(2026, 7, 30), [['c-deleted', 10, 20]])];
    expect(volumeByTarget(sessions, catalogue, 30, now)).toEqual([
      { target: UNKNOWN_TARGET, volume: 200, sets: 1 },
    ]);
  });

  it('keeps a bodyweight-only target at zero volume rather than hiding it', () => {
    const sessions = [mixed(at(2026, 7, 30), [['0003', 20, 0]])];
    expect(volumeByTarget(sessions, catalogue, 30, now)).toEqual([
      { target: 'abs', volume: 0, sets: 1 },
    ]);
  });

  it('counts calendar days, inclusive of today and exclusive of the far edge', () => {
    const sessions = [
      mixed(at(2026, 8, 1, 20), [['0001', 1, 1]]), // today, later than `now`
      mixed(at(2026, 7, 3), [['0002', 1, 10]]), // 29 days back
      mixed(at(2026, 7, 2), [['0003', 1, 100]]), // 30 days back
    ];
    expect(volumeByTarget(sessions, catalogue, 30, now).map((t) => t.target)).toEqual([
      'quads',
      'pectorals',
    ]);
  });

  it('ignores exercises that were listed but never logged', () => {
    const sessions = [session(at(2026, 7, 30), 'a', [{ exerciseId: '0001', sets: [] }])];
    expect(volumeByTarget(sessions, catalogue, 30, now)).toEqual([]);
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

describe('lifetimeStats', () => {
  it('is all zero/null with no history', () => {
    expect(lifetimeStats([])).toEqual({ totalSessions: 0, totalVolumeKg: 0, since: null });
  });

  it('sums sessions and volume, and finds the earliest startedAt', () => {
    const sessions = [
      session(at(2026, 8, 1), 'a', [
        { exerciseId: '0001', sets: [{ reps: 10, weight: 25, at: '' }] },
      ]),
      session(at(2026, 7, 20), 'a', [
        { exerciseId: '0001', sets: [{ reps: 8, weight: 30, at: '' }] },
      ]),
      session(at(2026, 7, 25)),
    ];
    expect(lifetimeStats(sessions)).toEqual({
      totalSessions: 3,
      totalVolumeKg: 10 * 25 + 8 * 30,
      since: at(2026, 7, 20),
    });
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

  it('averages session duration for one training', () => {
    const sessions = [
      { ...session(at(2026, 7, 20), 'pecs-back'), savedAt: at(2026, 7, 20, 12, 40) }, // 40m
      { ...session(at(2026, 7, 27), 'pecs-back'), savedAt: at(2026, 7, 27, 13, 0) }, // 60m
      { ...session(at(2026, 7, 21), 'leg-abs'), savedAt: at(2026, 7, 21, 13, 0) }, // other training
    ];
    expect(averageSessionMinutes('pecs-back', sessions)).toBe(50);
    expect(averageSessionMinutes('nope', sessions)).toBeNull();
  });

  it('ignores a session whose savedAt is at or before startedAt', () => {
    const sessions = [
      { ...session(at(2026, 7, 20), 'pecs-back'), savedAt: at(2026, 7, 20) }, // 0m, skipped
    ];
    expect(averageSessionMinutes('pecs-back', sessions)).toBeNull();
  });
});

describe('calendar', () => {
  it('startOfMonth anchors to the 1st', () => {
    expect(startOfMonth(new Date(2026, 7, 23))).toEqual(new Date(2026, 7, 1));
  });

  it('addMonths steps forward and backward, including across a year boundary', () => {
    expect(addMonths(new Date(2026, 7, 15), 1)).toEqual(new Date(2026, 8, 1));
    expect(addMonths(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
  });

  it('dayKey formats local-time YYYY-MM-DD, matching formatDate', () => {
    expect(dayKey(new Date(2026, 7, 4))).toBe('2026-08-04');
  });

  it('monthGrid returns a fixed 42-day Monday-start grid flagging the current month', () => {
    // August 2026 starts on a Saturday, so the grid leads with July's last Monday.
    const grid = monthGrid(new Date(2026, 7, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0]?.date).toEqual(new Date(2026, 6, 27));
    expect(grid[0]?.inMonth).toBe(false);

    const aug1 = grid.find((d) => d.date.getTime() === new Date(2026, 7, 1).getTime());
    expect(aug1?.inMonth).toBe(true);

    const aug31 = grid.find((d) => d.date.getTime() === new Date(2026, 7, 31).getTime());
    expect(aug31?.inMonth).toBe(true);
  });

  it('monthGrid is stable across a 6-week month', () => {
    // Only the row count matters here; always 42 days regardless of month length.
    expect(monthGrid(new Date(2026, 4, 1))).toHaveLength(42);
  });

  describe('sessionsByDay', () => {
    it('keys sessions by local calendar day', () => {
      const s = session(at(2026, 8, 1));
      const map = sessionsByDay([s]);
      expect(map.get('2026-08-01')).toBe(s);
      expect(map.size).toBe(1);
    });

    it('picks the most recent session when two land on the same day', () => {
      const earlier = session(at(2026, 8, 1, 9), 'a');
      const later = session(at(2026, 8, 1, 18), 'b');
      const map = sessionsByDay([earlier, later]);
      expect(map.get('2026-08-01')).toBe(later);
    });
  });

  describe('sportSessionsByDay', () => {
    it('keys sport sessions by their date field directly', () => {
      const s = sportSession('2026-08-01');
      const map = sportSessionsByDay([s]);
      expect(map.get('2026-08-01')).toEqual([s]);
    });

    it('keeps every entry on a day with more than one, unlike sessionsByDay', () => {
      const a = sportSession('2026-08-01', 'a', 'cycling');
      const b = sportSession('2026-08-01', 'b', 'climbing');
      const map = sportSessionsByDay([a, b]);
      expect(map.get('2026-08-01')).toEqual([a, b]);
    });
  });
});

describe('lastSportSessionForTraining', () => {
  it('returns the most recent log for that training', () => {
    const older = sportSession('2026-07-20', 'x');
    const newer = sportSession('2026-08-01', 'x');
    const other = sportSession('2026-08-05', 'y');
    expect(lastSportSessionForTraining('x', [older, newer, other])).toBe(newer);
  });

  it('returns null with no logs for that training', () => {
    expect(lastSportSessionForTraining('x', [sportSession('2026-08-01', 'y')])).toBeNull();
  });
});

describe('mergedHistory', () => {
  it('interleaves gym and sport sessions, newest first', () => {
    const gym = session(at(2026, 8, 1));
    const sport = sportSession('2026-08-03');
    const items = mergedHistory([gym], [sport]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: sport.kind, sportSession: sport });
    expect(items[1]).toMatchObject({ kind: 'gym', session: gym });
  });

  it("reads a sport session's date as local midnight", () => {
    const sport = sportSession('2026-08-03');
    const [item] = mergedHistory([], [sport]);
    expect(item?.at).toEqual(new Date(2026, 7, 3));
  });
});

describe('display helpers', () => {
  it('formats days back', () => {
    expect(formatDaysAgo(0)).toBe('today');
    expect(formatDaysAgo(1)).toBe('-1 day');
    expect(formatDaysAgo(9)).toBe('-9 days');
  });

  it('formats a short axis date without depending on the locale', () => {
    expect(formatShortDate(at(2026, 7, 23))).toBe('23 Jul');
    expect(formatShortDate(at(2026, 1, 5))).toBe('5 Jan');
  });

  it('formats elapsed time', () => {
    const start = at(2026, 8, 1, 10, 0);
    expect(formatElapsed(start, new Date(2026, 7, 1, 10, 24))).toBe('24m');
    expect(formatElapsed(start, new Date(2026, 7, 1, 11, 12))).toBe('1h 12m');
  });

  it('formats a rounded duration estimate', () => {
    expect(formatDurationEstimate(45)).toBe('~45m');
    expect(formatDurationEstimate(70)).toBe('~1h 10m');
    expect(formatDurationEstimate(0.2)).toBe('~1m');
  });
});

/* -------------------------------------------------------------------------- */
/* Rest timer                                                                  */
/* -------------------------------------------------------------------------- */

/** An arbitrary but fixed "now", so nothing here depends on the real clock. */
const T0 = 1_800_000_000_000;

describe('startRest', () => {
  it('stores an absolute deadline, not a countdown', () => {
    expect(startRest(90, T0)).toEqual({ targetMs: T0 + 90_000, totalSeconds: 90 });
  });
});

describe('remainingSeconds', () => {
  it('derives what is left from the clock', () => {
    const rest = startRest(90, T0);
    expect(remainingSeconds(rest.targetMs, T0)).toBe(90);
    expect(remainingSeconds(rest.targetMs, T0 + 30_000)).toBe(60);
    expect(remainingSeconds(rest.targetMs, T0 + 89_999)).toBe(1);
  });

  it('clamps at zero however far past the deadline it is', () => {
    const rest = startRest(90, T0);
    expect(remainingSeconds(rest.targetMs, T0 + 90_000)).toBe(0);
    // The backgrounded-tab case: no tick ran for ten minutes, and it does not matter.
    expect(remainingSeconds(rest.targetMs, T0 + 600_000)).toBe(0);
  });

  it('rounds up, so 0:01 is on screen for its whole second', () => {
    expect(remainingSeconds(T0 + 1, T0)).toBe(1);
    expect(remainingSeconds(T0 + 1000, T0)).toBe(1);
  });
});

describe('formatCountdown', () => {
  it('formats mm:ss', () => {
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('does not wrap past an hour', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(3661)).toBe('61:01');
  });

  it('never shows a negative', () => {
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('restPhase', () => {
  const rest = startRest(90, T0);

  it('runs until the deadline', () => {
    expect(restPhase(rest, T0)).toBe('running');
    expect(restPhase(rest, T0 + 89_999)).toBe('running');
  });

  it('is done for a while after it', () => {
    expect(restPhase(rest, T0 + 90_000)).toBe('done');
    expect(restPhase(rest, T0 + 90_000 + REST_DONE_MS)).toBe('done');
  });

  it('expires once nobody came back for it', () => {
    expect(restPhase(rest, T0 + 90_000 + REST_DONE_MS + 1)).toBe('expired');
    expect(restPhase(rest, T0 + 3_600_000)).toBe('expired');
  });
});

describe('restProgress', () => {
  it('runs 0 to 1 across the rest', () => {
    const rest = startRest(90, T0);
    expect(restProgress(rest, T0)).toBe(0);
    expect(restProgress(rest, T0 + 45_000)).toBeCloseTo(0.5);
    expect(restProgress(rest, T0 + 90_000)).toBe(1);
  });

  it('clamps at both ends', () => {
    const rest = startRest(90, T0);
    expect(restProgress(rest, T0 - 10_000)).toBe(0);
    expect(restProgress(rest, T0 + 200_000)).toBe(1);
  });
});

describe('a rest across a backgrounded tab', () => {
  it('reads the deadline rather than the ticks it missed', () => {
    const rest = startRest(90, T0);
    // Two ticks, then iOS suspends the tab and the app is reopened 3 minutes on.
    const observed = [T0 + 1_000, T0 + 2_000, T0 + 180_000];
    expect(observed.map((t) => remainingSeconds(rest.targetMs, t))).toEqual([89, 88, 0]);
    expect(restPhase(rest, T0 + 180_000)).toBe('expired');
  });

  it('is still counting down when the gap was short', () => {
    const rest = startRest(120, T0);
    expect(remainingSeconds(rest.targetMs, T0 + 45_000)).toBe(75);
    expect(restPhase(rest, T0 + 45_000)).toBe('running');
  });
});

describe('adjustRest', () => {
  it('extends the deadline and the denominator together', () => {
    const rest = adjustRest(startRest(90, T0), 30, T0 + 10_000);
    expect(rest.targetMs).toBe(T0 + 120_000);
    expect(rest.totalSeconds).toBe(120);
    expect(remainingSeconds(rest.targetMs, T0 + 10_000)).toBe(110);
  });

  it('shortens the deadline', () => {
    const rest = adjustRest(startRest(90, T0), -30, T0 + 10_000);
    expect(remainingSeconds(rest.targetMs, T0 + 10_000)).toBe(50);
    expect(rest.totalSeconds).toBe(60);
  });

  it('cannot push the deadline into the past — it just ends the rest', () => {
    const now = T0 + 80_000;
    const rest = adjustRest(startRest(90, T0), -30, now);
    expect(rest.targetMs).toBe(now);
    expect(remainingSeconds(rest.targetMs, now)).toBe(0);
    // Total still measured from the original start, so the bar reads full, not over.
    expect(rest.totalSeconds).toBe(80);
    expect(restProgress(rest, now)).toBe(1);
  });

  it('survives repeated adjustment without drifting off the original start', () => {
    let rest = startRest(60, T0);
    rest = adjustRest(rest, 30, T0 + 5_000);
    rest = adjustRest(rest, 30, T0 + 6_000);
    rest = adjustRest(rest, -30, T0 + 7_000);
    expect(rest.targetMs).toBe(T0 + 90_000);
    expect(rest.totalSeconds).toBe(90);
  });
});
