/**
 * Derived read models. Pure functions over already-loaded state — no I/O, no
 * React. Everything here is unit-tested and safe to call during render.
 *
 * All date maths is local-timezone. Weeks are ISO weeks (Monday 00:00 start).
 */
import type { Session, SetEntry, Training } from './types';

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const mondayIndex = (x.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  x.setDate(x.getDate() - mondayIndex);
  return x;
}

function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

/**
 * Whole calendar days from `from` to `to`. Rounding absorbs the ±1h that DST
 * transitions introduce, so a 9-day gap stays 9 across a clock change.
 */
export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-07-23` */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `2026-07-23 18:40` */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `today`, `-1 day`, `-9 days` */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '-1 day';
  return `-${days} days`;
}

/** `1h 12m` / `24m` — elapsed time of a running session. */
export function formatElapsed(fromIso: string, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

/** Newest first. Every list in the UI is ordered this way. */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function mostRecentSession(sessions: Session[]): Session | null {
  let best: Session | null = null;
  for (const s of sessions) {
    if (!best || new Date(s.startedAt).getTime() > new Date(best.startedAt).getTime()) best = s;
  }
  return best;
}

export function setCount(session: Pick<Session, 'entries'>): number {
  return session.entries.reduce((n, e) => n + e.sets.length, 0);
}

/** Total kg moved: Σ reps × weight. Bodyweight sets contribute 0. */
export function totalVolume(session: Pick<Session, 'entries'>): number {
  return session.entries.reduce(
    (sum, e) => sum + e.sets.reduce((s, x) => s + x.reps * x.weight, 0),
    0,
  );
}

/** Sessions started within the ISO week containing `now`. */
export function currentWeekCount(sessions: Session[], now: Date): number {
  const from = startOfWeek(now).getTime();
  const to = addWeeks(startOfWeek(now), 1).getTime();
  return sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return t >= from && t < to;
  }).length;
}

/**
 * Consecutive weeks meeting `goal`, counting backwards.
 *
 * The current week is included only if it already meets the goal, so a streak
 * is never reported as broken halfway through the week you're still in.
 */
export function weeklyStreak(sessions: Session[], goal: number, now: Date): number {
  if (goal <= 0) return 0;

  const perWeek = new Map<number, number>();
  for (const s of sessions) {
    const key = startOfWeek(new Date(s.startedAt)).getTime();
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }

  const met = (d: Date) => (perWeek.get(d.getTime()) ?? 0) >= goal;

  let streak = 0;
  let cursor = startOfWeek(now);
  if (met(cursor)) streak += 1;

  cursor = addWeeks(cursor, -1);
  while (met(cursor)) {
    streak += 1;
    cursor = addWeeks(cursor, -1);
  }
  return streak;
}

/* -------------------------------------------------------------------------- */
/* Rotation                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The training to do next: strictly the one after the last completed session's
 * training, wrapping. Falls back to the first training when there is no
 * history, or when the last session's training no longer exists.
 */
export function nextTraining(trainings: Training[], sessions: Session[]): Training | null {
  const ordered = [...trainings].sort((a, b) => a.order - b.order);
  const first = ordered[0];
  if (!first) return null;

  const last = mostRecentSession(sessions);
  if (!last) return first;

  const i = ordered.findIndex((t) => t.id === last.trainingId);
  if (i < 0) return first;

  return ordered[(i + 1) % ordered.length] ?? first;
}

export function lastSessionForTraining(trainingId: string, sessions: Session[]): Session | null {
  return mostRecentSession(sessions.filter((s) => s.trainingId === trainingId));
}

/** True when a session was already completed today. */
export function completedToday(sessions: Session[], now: Date): Session | null {
  const last = mostRecentSession(sessions);
  return last && isSameDay(new Date(last.startedAt), now) ? last : null;
}

/* -------------------------------------------------------------------------- */
/* Per-exercise history                                                        */
/* -------------------------------------------------------------------------- */

export type ExerciseRecord = {
  session: Session;
  sets: SetEntry[];
  /** Calendar days between that session and `now`. */
  daysAgo: number;
};

/**
 * Every session in which the exercise was actually logged, newest first.
 * Entries with no sets are skipped — they carry no training data.
 */
export function historyFor(
  exerciseId: string,
  sessions: Session[],
  now: Date = new Date(),
): ExerciseRecord[] {
  const out: ExerciseRecord[] = [];
  for (const session of sortSessions(sessions)) {
    const entry = session.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) continue;
    out.push({
      session,
      sets: entry.sets,
      daysAgo: daysBetween(new Date(session.startedAt), now),
    });
  }
  return out;
}

/** The most recent logged occurrence of an exercise, or null. */
export function latestFor(
  exerciseId: string,
  sessions: Session[],
  now: Date = new Date(),
): ExerciseRecord | null {
  return historyFor(exerciseId, sessions, now)[0] ?? null;
}
