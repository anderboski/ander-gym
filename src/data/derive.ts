/**
 * Derived read models. Pure functions over already-loaded state — no I/O, no
 * React. Everything here is unit-tested and safe to call during render.
 *
 * All date maths is local-timezone. Weeks are ISO weeks (Monday 00:00 start).
 */
import {
  CLIMB_GRADES,
  SNOW_CONDITIONS,
  WEATHER_CONDITIONS,
  type ClimbGrade,
  type CyclingSession,
  type Exercise,
  type Session,
  type SetEntry,
  type SportSession,
  type Training,
} from './types';

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

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
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

/**
 * Parses a `YYYY-MM-DD` string as local midnight, not UTC — `new Date(str)`
 * would shift a day in any timezone west of UTC, the same DST/timezone trap
 * every other date helper here is built to avoid.
 */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Whole years from `birthdate` (`YYYY-MM-DD`) to `now`. */
export function ageFrom(birthdate: string, now: Date): number {
  const b = parseLocalDate(birthdate);
  let age = now.getFullYear() - b.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** Standard BMI (kg / m²). Caller supplies both — this is deliberately not
 *  wired to any specific weight/height source. */
export function bmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export type GreetingBucket = 'morning' | 'day' | 'evening';

/** Morning 5:00–11:59, day 12:00–17:59, evening everything else (18:00–4:59). */
export function greetingBucket(now: Date): GreetingBucket {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  return 'evening';
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-07-23`, local-time. Shared by `formatDate` and the calendar's day lookup. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `2026-07-23` */
export function formatDate(iso: string): string {
  return dayKey(new Date(iso));
}

/** `2026-07-23 18:40` */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `23 Jul` — chart axes only, where `2026-07-23` is too wide for a phone.
 * Spelled out here rather than via `toLocaleDateString` so the output does not
 * depend on the device locale, which would move the axis labels under the user.
 */
function shortDateLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** `23 Jul` from a full timestamp (session/set `at` fields). */
export function formatShortDate(iso: string): string {
  return shortDateLabel(new Date(iso));
}

/**
 * `Jul 26` — a month bucket on a chart axis, where two `1 Aug` edges a year
 * apart would read as the same date. Same locale-independent months as
 * `formatShortDate`, for the same reason.
 */
export function formatShortMonth(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()] ?? ''} ${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

/**
 * `23 Jul` from a bare `YYYY-MM-DD` date (check-ins) — parsed as local
 * midnight via `parseLocalDate` rather than `formatShortDate`'s `new
 * Date(iso)`, which would read a date-only string as UTC and can land on the
 * wrong day west of UTC.
 */
export function formatShortLocalDate(isoDate: string): string {
  return shortDateLabel(parseLocalDate(isoDate));
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

/** `~1h 10m` / `~45m` — a rounded, approximate duration, not a live countdown. */
export function formatDurationEstimate(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  const h = Math.floor(whole / 60);
  return h > 0 ? `~${h}h ${whole % 60}m` : `~${whole}m`;
}

/* -------------------------------------------------------------------------- */
/* Rest timer                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A rest in progress.
 *
 * `targetMs` is an absolute wall-clock deadline, never a counter something has
 * to decrement: iOS suspends timers in a backgrounded tab, so an interval that
 * subtracts a second at a time drifts or stops outright. Every reader derives
 * what is left from `Date.now()` instead, which stays correct across a suspend
 * because nothing was being counted in the first place.
 *
 * `totalSeconds` is kept only so the progress bar has a denominator.
 */
export type RestTimer = { targetMs: number; totalSeconds: number };

/** How long a finished rest stays on screen before it clears itself. */
export const REST_DONE_MS = 30_000;

export function startRest(seconds: number, nowMs: number): RestTimer {
  return { targetMs: nowMs + seconds * 1000, totalSeconds: seconds };
}

/** Whole seconds left, rounded up so "0:01" is shown for its full second. */
export function remainingSeconds(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

/** `1:30`, `0:05`, `10:00` — mm:ss, minutes uncapped. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${pad(whole % 60)}`;
}

/** 0 → 1 across the rest. Clamped, so an adjusted timer cannot overflow the bar. */
export function restProgress(rest: RestTimer, nowMs: number): number {
  const totalMs = rest.totalSeconds * 1000;
  if (totalMs <= 0) return 1;
  const elapsed = totalMs - (rest.targetMs - nowMs);
  return Math.min(1, Math.max(0, elapsed / totalMs));
}

export type RestPhase = 'running' | 'done' | 'expired';

/**
 * `expired` is the backgrounded-tab case: returning to the app long after a
 * rest ended should clear it silently rather than announce a rest that finished
 * ten minutes ago.
 */
export function restPhase(rest: RestTimer, nowMs: number): RestPhase {
  if (nowMs < rest.targetMs) return 'running';
  return nowMs - rest.targetMs > REST_DONE_MS ? 'expired' : 'done';
}

/**
 * Inline ±30 s. The deadline never moves behind `now` — shortening a rest past
 * its remaining time simply ends it — and `totalSeconds` is re-derived from the
 * original start so the progress bar keeps telling the truth.
 */
export function adjustRest(rest: RestTimer, deltaSeconds: number, nowMs: number): RestTimer {
  const startedMs = rest.targetMs - rest.totalSeconds * 1000;
  const targetMs = Math.max(nowMs, rest.targetMs + deltaSeconds * 1000);
  return { targetMs, totalSeconds: Math.max(1, Math.round((targetMs - startedMs) / 1000)) };
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

export type LifetimeStats = {
  totalSessions: number;
  /** Σ `totalVolume` across every saved session, kg. */
  totalVolumeKg: number;
  /** `startedAt` of the earliest saved session, or null with no history yet. */
  since: string | null;
};

/** All-time totals for the Home footer. Walks every session once. */
export function lifetimeStats(sessions: Session[]): LifetimeStats {
  let totalVolumeKg = 0;
  let since: string | null = null;
  for (const s of sessions) {
    totalVolumeKg += totalVolume(s);
    if (!since || new Date(s.startedAt).getTime() < new Date(since).getTime()) since = s.startedAt;
  }
  return { totalSessions: sessions.length, totalVolumeKg, since };
}

/* -------------------------------------------------------------------------- */
/* Rotation                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The training to do next: strictly the one after the last completed session's
 * training, wrapping. Falls back to the first training when there is no
 * history, or when the last session's training no longer exists. Archived
 * trainings are never returned — they've dropped out of rotation — but the
 * last *session's* training is looked up against the full list so an archived
 * training doesn't also break the "what comes after it" pivot.
 */
/** Only a `'gym'` (or kind-absent) training takes part in Home's rotation. */
function isRotationCandidate(t: Training): boolean {
  return !t.archived && (t.kind ?? 'gym') === 'gym';
}

export function nextTraining(trainings: Training[], sessions: Session[]): Training | null {
  const active = [...trainings].filter(isRotationCandidate).sort((a, b) => a.order - b.order);
  const first = active[0];
  if (!first) return null;

  const last = mostRecentSession(sessions);
  if (!last) return first;

  const allOrdered = [...trainings].sort((a, b) => a.order - b.order);
  const lastIdx = allOrdered.findIndex((t) => t.id === last.trainingId);
  if (lastIdx < 0) return first;

  // Walk forward from the last session's slot in the full (unfiltered) order
  // until landing on an active training, wrapping at most once around.
  for (let step = 1; step <= allOrdered.length; step += 1) {
    const candidate = allOrdered[(lastIdx + step) % allOrdered.length];
    if (candidate && isRotationCandidate(candidate)) return candidate;
  }
  return first;
}

export function lastSessionForTraining(trainingId: string, sessions: Session[]): Session | null {
  return mostRecentSession(sessions.filter((s) => s.trainingId === trainingId));
}

/** Same idea as `lastSessionForTraining`, over a sport training's logs — `date` is already a plain `YYYY-MM-DD` string, so the "most recent" comparison is a string sort, no `Date` needed. */
export function lastSportSessionForTraining(
  trainingId: string,
  sportSessions: SportSession[],
): SportSession | null {
  const matches = sportSessions.filter((s) => s.trainingId === trainingId);
  if (matches.length === 0) return null;
  return matches.reduce((best, s) => (s.date > best.date ? s : best));
}

/**
 * Average minutes from `startedAt` to `savedAt` across every saved session for
 * one training, or null with no history to average. A session salvaged from a
 * force-quit can carry a `savedAt` at or before `startedAt` (e.g. an import
 * with clock skew) — those contribute nothing rather than dragging the
 * average negative.
 */
export function averageSessionMinutes(trainingId: string, sessions: Session[]): number | null {
  const minutes = sessions
    .filter((s) => s.trainingId === trainingId)
    .map((s) => (new Date(s.savedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000)
    .filter((m) => m > 0);
  if (minutes.length === 0) return null;
  return minutes.reduce((a, b) => a + b, 0) / minutes.length;
}

/**
 * The Home calendar shows at most one training per day, so where two sessions
 * land on the same date the later one wins — same rule as `completedToday`.
 * Keyed by `formatDate`, which is already local-time `YYYY-MM-DD`.
 */
export function sessionsByDay(sessions: Session[]): Map<string, Session> {
  const out = new Map<string, Session>();
  for (const s of sortSessions(sessions)) {
    const key = dayKey(new Date(s.startedAt));
    if (!out.has(key)) out.set(key, s);
  }
  return out;
}

/**
 * Every sport session on a given day, keyed by `SportSession.date` directly —
 * that field is already local `YYYY-MM-DD`, the same shape `dayKey` produces,
 * so no `Date` round-trip is needed the way `sessionsByDay` needs one for
 * `Session.startedAt` (a full timestamp). Unlike `sessionsByDay`, a day here
 * keeps every entry rather than picking one "later wins" winner: the whole
 * point of showing sports on the calendar is seeing all of them.
 */
export function sportSessionsByDay(sportSessions: SportSession[]): Map<string, SportSession[]> {
  const out = new Map<string, SportSession[]>();
  for (const s of sportSessions) {
    const list = out.get(s.date) ?? [];
    list.push(s);
    out.set(s.date, list);
  }
  return out;
}

/** One row in a merged, reverse-chronological view of everything logged. */
export type HistoryItem =
  | { at: Date; kind: 'gym'; session: Session }
  | { at: Date; kind: SportSession['kind']; sportSession: SportSession };

/**
 * Gym sessions and sport sessions interleaved, newest first — History shows
 * one list of everything rather than splitting by kind. A sport session's
 * `at` is its `date` at local midnight (`parseLocalDate`); on a day that also
 * has a gym session, the gym session's real time-of-day sorts after it.
 */
export function mergedHistory(sessions: Session[], sportSessions: SportSession[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...sessions.map((session): HistoryItem => ({ at: new Date(session.startedAt), kind: 'gym', session })),
    ...sportSessions.map(
      (sportSession): HistoryItem => ({ at: parseLocalDate(sportSession.date), kind: sportSession.kind, sportSession }),
    ),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type CalendarDay = { date: Date; inMonth: boolean };

/**
 * Monday-start weeks covering the month containing `monthAnchor`, padded with
 * the leading/trailing days of the neighbouring months so every week is full.
 * Always 6 rows (42 days): a fixed grid height means the page doesn't jump as
 * the user pages between four-week and six-week months.
 */
export function monthGrid(monthAnchor: Date): CalendarDay[] {
  const first = startOfMonth(monthAnchor);
  const gridStart = startOfWeek(first);
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    days.push({ date, inMonth: date.getMonth() === first.getMonth() });
  }
  return days;
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

export type LatestByExercise = Map<string, ExerciseRecord>;

/**
 * The most recent logged occurrence of every exercise, in one pass over the
 * history.
 *
 * The Exercises carousel renders a card per exercise out of a 1324-record
 * catalogue; calling `latestFor` per card would rescan every session per
 * card. Callers build this map once per change to `sessions` instead (see
 * `useGym().exerciseLatest`).
 */
export function allLatestFor(sessions: Session[], now: Date = new Date()): LatestByExercise {
  const out: LatestByExercise = new Map();
  for (const session of sortSessions(sessions)) {
    for (const entry of session.entries) {
      if (entry.sets.length === 0 || out.has(entry.exerciseId)) continue;
      out.set(entry.exerciseId, {
        session,
        sets: entry.sets,
        daysAgo: daysBetween(new Date(session.startedAt), now),
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Personal records                                                            */
/* -------------------------------------------------------------------------- */

/** A saved session or the one in progress — records read the same fields from both. */
export type LoggedSession = Pick<Session, 'startedAt' | 'entries'>;

export type PersonalRecords = {
  /** Heaviest set ever logged for the exercise. */
  heaviest: SetEntry;
  /** Heaviest set at each rep count, keyed by reps. */
  byReps: Map<number, SetEntry>;
};

export type RecordsByExercise = Map<string, PersonalRecords>;

/**
 * Fold one set into the accumulator, creating the exercise's entry on demand.
 *
 * Bodyweight sets (`weight: 0`) are skipped: they are real training data but
 * carry no load to rank, and admitting them would badge every unweighted
 * exercise with a "0 kg" record that no later set could ever beat by weight.
 *
 * Comparisons are strictly greater-than and callers walk sessions oldest-first,
 * so an equal set logged later leaves the earlier record standing.
 */
function absorb(into: RecordsByExercise, exerciseId: string, set: SetEntry): void {
  if (set.weight <= 0) return;

  const current = into.get(exerciseId);
  if (!current) {
    into.set(exerciseId, { heaviest: set, byReps: new Map([[set.reps, set]]) });
    return;
  }

  if (set.weight > current.heaviest.weight) current.heaviest = set;

  const atReps = current.byReps.get(set.reps);
  if (!atReps || set.weight > atReps.weight) current.byReps.set(set.reps, set);
}

/** Oldest first, which is what makes ties resolve in favour of the earlier set. */
function chronological(sessions: LoggedSession[]): LoggedSession[] {
  return [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
}

/**
 * Records for every exercise in one pass over the history.
 *
 * The Exercises carousel renders cards from a 1324-record catalogue; calling
 * `personalRecords` per card would rescan every session per card. Callers build
 * this map once per change to `sessions` instead (see `useGym().exerciseRecords`).
 */
export function allPersonalRecords(sessions: LoggedSession[]): RecordsByExercise {
  const out: RecordsByExercise = new Map();
  for (const session of chronological(sessions)) {
    for (const entry of session.entries) {
      for (const set of entry.sets) absorb(out, entry.exerciseId, set);
    }
  }
  return out;
}

/**
 * Records for a single exercise, or null when it has never been logged with
 * weight. Use `allPersonalRecords` when more than one exercise is needed.
 */
export function personalRecords(
  exerciseId: string,
  sessions: LoggedSession[],
): PersonalRecords | null {
  const out: RecordsByExercise = new Map();
  for (const session of chronological(sessions)) {
    const entry = session.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    for (const set of entry.sets) absorb(out, exerciseId, set);
  }
  return out.get(exerciseId) ?? null;
}

/**
 * True when `set` beats a record that already existed — heaviest ever, or the
 * best at its own rep count.
 *
 * Deliberately narrower than "sets a record": a first-ever set, or the first at
 * some rep count, becomes the record but beat nothing, and announcing those
 * would fire on nearly every set a new user logs. Bodyweight sets never qualify.
 */
export function beatsPersonalRecord(
  set: Pick<SetEntry, 'reps' | 'weight'>,
  records: PersonalRecords | null,
): boolean {
  if (set.weight <= 0 || !records) return false;
  if (set.weight > records.heaviest.weight) return true;

  const atReps = records.byReps.get(set.reps);
  return atReps !== undefined && set.weight > atReps.weight;
}

/* -------------------------------------------------------------------------- */
/* Progress over time                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Estimated one-rep max, Epley: `weight × (1 + reps/30)`.
 *
 * An estimate, not a measurement — its job is to make sets at different rep
 * counts comparable on one axis, so that 8×30 and 5×35 sit on the same trend
 * line instead of on two unrelated ones.
 */
export function epley1RM(reps: number, weight: number): number {
  return weight * (1 + reps / 30);
}

/** Which number a progress chart plots. */
export type ProgressMetric = 'topWeight' | 'e1rm';

const METRIC: Record<ProgressMetric, (set: SetEntry) => number> = {
  topWeight: (set) => set.weight,
  e1rm: (set) => epley1RM(set.reps, set.weight),
};

/** One session's best set under the chosen metric. */
export type ProgressPoint = {
  /** `startedAt` of the session the point came from. */
  at: string;
  value: number;
  /** The set the value was read from, so the chart can label it `8x30kg`. */
  set: SetEntry;
};

/**
 * The per-session trend for one exercise, **oldest first** — charts read left
 * to right, while `historyFor` returns newest first.
 *
 * Each session contributes exactly one point: its best set under the metric,
 * ties going to the earlier set (same rule as `personalRecords`). Bodyweight
 * sets are skipped, so a session logged entirely at `weight: 0` contributes no
 * point rather than a phantom zero that would crater the line.
 */
export function exerciseProgress(
  history: ExerciseRecord[],
  metric: ProgressMetric,
): ProgressPoint[] {
  const measure = METRIC[metric];
  const out: ProgressPoint[] = [];

  for (const record of history) {
    let best: ProgressPoint | null = null;
    for (const set of record.sets) {
      if (set.weight <= 0) continue;
      const value = measure(set);
      if (!best || value > best.value) best = { at: record.session.startedAt, value, set };
    }
    if (best) out.push(best);
  }

  return out.reverse();
}

/* -------------------------------------------------------------------------- */
/* Volume and consistency                                                      */
/* -------------------------------------------------------------------------- */

/** One ISO week's totals. `start` is the local Monday 00:00 of that week. */
export type WeekStat = {
  start: string;
  sessions: number;
  volume: number;
};

/**
 * The last `weeks` ISO weeks ending with the one containing `now`, oldest
 * first. Weeks with nothing logged are present with zeros: a gap is the whole
 * point of a consistency chart, and dropping empty weeks would silently
 * compress a month off training into a flat line.
 */
export function weeklySummary(sessions: Session[], weeks: number, now: Date): WeekStat[] {
  const buckets = new Map<number, { sessions: number; volume: number }>();
  for (const s of sessions) {
    const key = startOfWeek(new Date(s.startedAt)).getTime();
    const bucket = buckets.get(key) ?? { sessions: 0, volume: 0 };
    bucket.sessions += 1;
    bucket.volume += totalVolume(s);
    buckets.set(key, bucket);
  }

  const out: WeekStat[] = [];
  const thisWeek = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addWeeks(thisWeek, -i);
    const bucket = buckets.get(start.getTime());
    out.push({
      start: start.toISOString(),
      sessions: bucket?.sessions ?? 0,
      volume: bucket?.volume ?? 0,
    });
  }
  return out;
}

/** Bucket for sets whose exercise id resolves to nothing in the catalogue. */
export const UNKNOWN_TARGET = 'unknown';

export type TargetVolume = {
  /** An `Exercise.target` value, or `UNKNOWN_TARGET`. */
  target: string;
  volume: number;
  sets: number;
};

/**
 * Volume per muscle `target` over `range`, heaviest first — the "am I skipping legs?" view.
 *
 * `target` lives on the catalogue, never on a `SessionEntry` (which snapshots
 * ids only, SPEC §3), so the lookup is passed in and this stays pure. An id
 * that resolves to nothing — a custom exercise deleted by a Replace import —
 * is bucketed under `UNKNOWN_TARGET` rather than dropped, so the breakdown
 * still adds up to the volume the user actually lifted.
 *
 * Targets trained only at bodyweight are kept with `volume: 0`: they carry no
 * load but they are not skipped days either, and `sets` says so.
 */
export function volumeByTarget(
  sessions: Session[],
  exercises: ReadonlyMap<string, Pick<Exercise, 'target'>>,
  range: StatsRange,
): TargetVolume[] {
  const totals = new Map<string, { volume: number; sets: number }>();

  for (const session of sessions) {
    if (!inRange(new Date(session.startedAt), range)) continue;

    for (const entry of session.entries) {
      if (entry.sets.length === 0) continue;
      const target = exercises.get(entry.exerciseId)?.target ?? UNKNOWN_TARGET;
      const total = totals.get(target) ?? { volume: 0, sets: 0 };
      for (const set of entry.sets) {
        total.volume += set.reps * set.weight;
        total.sets += 1;
      }
      totals.set(target, total);
    }
  }

  return [...totals]
    .map(([target, total]) => ({ target, ...total }))
    .sort((a, b) => b.volume - a.volume || b.sets - a.sets || a.target.localeCompare(b.target));
}

/* -------------------------------------------------------------------------- */
/* Stats page time window                                                      */
/* -------------------------------------------------------------------------- */

export const STATS_PERIODS = ['month', 'threeMonths', 'year', 'custom'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export const STATS_VIEWS = ['daily', 'weekly', 'monthly'] as const;
export type StatsView = (typeof STATS_VIEWS)[number];

/** Trailing calendar days each fixed period covers. `custom` has none — its span comes from the two picked dates. */
export const STATS_PERIOD_DAYS: Record<Exclude<StatsPeriod, 'custom'>, number> = {
  month: 30,
  threeMonths: 90,
  year: 365,
};

/**
 * A resolved window every stats aggregate is scoped to: `start` at local
 * midnight inclusive, `end` at local midnight exclusive.
 *
 * A single window type instead of the old `(days, now)` pair, because a
 * custom range has no "days back from now" to express — and with one type
 * the period control resolves the window once and every aggregate filters
 * the same way.
 */
export type StatsRange = { start: Date; end: Date };

/** The two `YYYY-MM-DD` dates behind the custom period, both inclusive. Empty strings mean "not picked yet". */
export type CustomRangeInput = { from: string; to: string };

function inRange(at: Date, range: StatsRange): boolean {
  const t = at.getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** The last `days` calendar days ending with today — today counts as day 1, matching the old `age < days` filter. */
export function trailingRange(days: number, now: Date): StatsRange {
  const end = startOfDay(now);
  end.setDate(end.getDate() + 1);
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The window two picked dates describe, both days included.
 *
 * Null when either date is missing or the pair is inverted: the Stats page
 * shows a hint rather than charting a window the user did not ask for.
 */
export function customStatsRange({ from, to }: CustomRangeInput): StatsRange | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return null;
  const end = parseLocalDate(to);
  end.setDate(end.getDate() + 1);
  return { start: parseLocalDate(from), end };
}

/** The window a period selection resolves to. Null only for an incomplete or inverted custom range. */
export function resolveStatsRange(period: StatsPeriod, now: Date, custom: CustomRangeInput): StatsRange | null {
  return period === 'custom' ? customStatsRange(custom) : trailingRange(STATS_PERIOD_DAYS[period], now);
}

/** Whole calendar days the window spans. */
export function rangeDays(range: StatsRange): number {
  return daysBetween(range.start, range.end);
}

/**
 * Bucket sizes that say something about a window of this length, in this
 * order. Bounds rather than a per-period table, because a custom range can be
 * any span: 90 daily slivers don't fit a phone, a single weekly bar over four
 * days isn't a trend, and a monthly bar needs more than one month to compare
 * against. Every span lands on at least one view — the daily ceiling sits
 * above the weekly floor, and the weekly ceiling above the monthly floor.
 */
const DAILY_MAX_DAYS = 45;
const WEEKLY_MIN_DAYS = 10;
const WEEKLY_MAX_DAYS = 210;
const MONTHLY_MIN_DAYS = 60;

export function viewsForRange(range: StatsRange): StatsView[] {
  const days = rangeDays(range);
  const views: StatsView[] = [];
  if (days <= DAILY_MAX_DAYS) views.push('daily');
  if (days >= WEEKLY_MIN_DAYS && days <= WEEKLY_MAX_DAYS) views.push('weekly');
  if (days >= MONTHLY_MIN_DAYS) views.push('monthly');
  return views;
}

/**
 * The view to select when the current one is not offered for a window.
 * Weekly first where it fits: a week is the unit the goal is set in, so it is
 * the one bucket the sessions chart can draw its reference line on.
 */
export function defaultStatsView(range: StatsRange): StatsView {
  const views = viewsForRange(range);
  return views.includes('weekly') ? 'weekly' : (views[0] ?? 'monthly');
}

/** One time-series bucket for the sessions-count and duration charts. */
export type PeriodStat = {
  start: string;
  sessions: number;
  volume: number;
  /** Average minutes across sessions in the bucket with a positive `savedAt - startedAt`, or null with none to average — same "positive only" rule as `averageSessionMinutes`. */
  avgMinutes: number | null;
};

function bucketStartOf(view: StatsView, d: Date): Date {
  return view === 'daily' ? startOfDay(d) : view === 'weekly' ? startOfWeek(d) : startOfMonth(d);
}

function stepBucket(view: StatsView, d: Date, n: number): Date {
  if (view === 'daily') {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  return view === 'weekly' ? addWeeks(d, n) : addMonths(d, n);
}

/**
 * Sessions bucketed by day/week/month across `range`, oldest first.
 *
 * The buckets run from the one containing `range.start` to the one containing
 * its last day, so the edges are whole buckets even when the window cuts a
 * week or a month in half — a partial edge bucket is drawn from every session
 * it holds, not just the part inside the window, because a bar labelled "week
 * of the 3rd" that silently dropped the 1st and 2nd would read as a dip that
 * never happened. Empty buckets are present with zeros, same reasoning as
 * `weeklySummary`: a gap in training is the point.
 */
export function statsBuckets(sessions: Session[], range: StatsRange, view: StatsView): PeriodStat[] {
  const buckets = new Map<number, { sessions: number; volume: number; minutes: number[] }>();
  for (const s of sessions) {
    const key = bucketStartOf(view, new Date(s.startedAt)).getTime();
    const bucket = buckets.get(key) ?? { sessions: 0, volume: 0, minutes: [] };
    bucket.sessions += 1;
    bucket.volume += totalVolume(s);
    const minutes = (new Date(s.savedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000;
    if (minutes > 0) bucket.minutes.push(minutes);
    buckets.set(key, bucket);
  }

  const lastDay = new Date(range.end.getTime() - 1);
  const first = bucketStartOf(view, range.start);
  const out: PeriodStat[] = [];
  for (let start = first; start.getTime() <= bucketStartOf(view, lastDay).getTime(); start = stepBucket(view, start, 1)) {
    const bucket = buckets.get(start.getTime());
    out.push({
      start: start.toISOString(),
      sessions: bucket?.sessions ?? 0,
      volume: bucket?.volume ?? 0,
      avgMinutes:
        bucket && bucket.minutes.length > 0
          ? bucket.minutes.reduce((a, b) => a + b, 0) / bucket.minutes.length
          : null,
    });
  }
  return out;
}

export type ExerciseCount = { exerciseId: string; count: number };

/**
 * The exercises done most often in `range`, ranked by how many separate
 * sessions included at least one set for it — "how many times you've done
 * it", not how many individual sets. Ties break by id for a stable order.
 */
export function topExercises(sessions: Session[], range: StatsRange, limit: number): ExerciseCount[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (!inRange(new Date(s.startedAt), range)) continue;
    for (const entry of s.entries) {
      if (entry.sets.length === 0) continue;
      counts.set(entry.exerciseId, (counts.get(entry.exerciseId) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([exerciseId, count]) => ({ exerciseId, count }))
    .sort((a, b) => b.count - a.count || a.exerciseId.localeCompare(b.exerciseId))
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Training time-of-week map (gym)                                             */
/* -------------------------------------------------------------------------- */

/** One saved gym session placed on the day-of-week × time-of-day grid. */
export type TrainingTimePoint = {
  sessionId: string;
  trainingId: string;
  /** 0 = Monday … 6 = Sunday, matching `startOfWeek`'s Monday-first weeks. */
  weekday: number;
  /** Minutes from local midnight of `startedAt` — when the session began, not when it was saved. */
  minutes: number;
  /** The training's emoji, or the first letter of its label — the same badge the Trainings list and the Home calendar draw. */
  badge: string;
  label: string;
};

export type TrainingTimeSeries = { trainingId: string; badge: string; label: string; count: number };

export type TrainingTimeMap = {
  points: TrainingTimePoint[];
  /** One entry per training with points in the window, most sessions first — the legend, and the reason the badges are readable at all. */
  series: TrainingTimeSeries[];
  /** Whole-hour minute bounds for the y axis, fitted to the points. */
  axis: [number, number];
};

/** Fallback badge for a training that no longer resolves — the session's own label snapshot is all that's left. */
function badgeOf(label: string): string {
  return label.charAt(0).toUpperCase();
}

const HOUR = 60;
/** Below this the markers of a normal training week stack into an unreadable strip, so the axis is padded out to it. */
const MIN_AXIS_SPAN = 6 * HOUR;
/** What an empty map shows: a plain 06:00–22:00 day, so the grid still reads as a day. */
const EMPTY_AXIS: [number, number] = [6 * HOUR, 22 * HOUR];

/**
 * Every saved gym session in `range` as a point on a day-of-week × time-of-day
 * grid — "what do I train, on which day, at what time".
 *
 * `sessions` only ever holds gym sessions (sport kinds log to `sportSessions`
 * instead, SPEC §3), so there is no kind to filter on here. Badges resolve
 * from the live training rather than from the session, so a renamed or
 * re-emoji'd training redraws consistently; a training that no longer
 * resolves falls back to the label the session snapshotted at start time.
 *
 * The axis is fitted to the data and rounded out to whole hours: a fixed
 * 00:00–24:00 grid spends most of its height on hours nobody trains in.
 */
export function trainingTimeOfDay(sessions: Session[], trainings: Training[], range: StatsRange): TrainingTimeMap {
  const byId = new Map(trainings.map((t) => [t.id, t]));
  const points: TrainingTimePoint[] = [];

  for (const s of sessions) {
    const at = new Date(s.startedAt);
    if (!inRange(at, range)) continue;
    const training = byId.get(s.trainingId);
    points.push({
      sessionId: s.id,
      trainingId: s.trainingId,
      weekday: (at.getDay() + 6) % 7,
      minutes: at.getHours() * 60 + at.getMinutes(),
      badge: training?.emoji ?? badgeOf(training?.label ?? s.trainingLabel),
      label: training?.label ?? s.trainingLabel,
    });
  }

  const counts = new Map<string, TrainingTimeSeries>();
  for (const p of points) {
    const entry = counts.get(p.trainingId);
    if (entry) entry.count += 1;
    else counts.set(p.trainingId, { trainingId: p.trainingId, badge: p.badge, label: p.label, count: 1 });
  }

  return {
    points: points.sort((a, b) => a.weekday - b.weekday || a.minutes - b.minutes || a.sessionId.localeCompare(b.sessionId)),
    series: [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    axis: timeAxisBounds(points.map((p) => p.minutes)),
  };
}

/**
 * Whole-hour bounds containing every minute value, widened symmetrically to
 * `MIN_AXIS_SPAN` and clamped to the day — a single session, or a week of
 * sessions all at 18:00, would otherwise collapse the axis to zero height.
 */
export function timeAxisBounds(minutes: number[]): [number, number] {
  if (minutes.length === 0) return EMPTY_AXIS;
  let lo = Math.floor(Math.min(...minutes) / HOUR) * HOUR;
  let hi = Math.ceil(Math.max(...minutes) / HOUR) * HOUR;
  while (hi - lo < MIN_AXIS_SPAN) {
    if (lo > 0) lo -= HOUR;
    if (hi - lo < MIN_AXIS_SPAN && hi < 24 * HOUR) hi += HOUR;
    if (lo === 0 && hi === 24 * HOUR) break;
  }
  return [lo, hi];
}

/** `18:45` from minutes-from-midnight. 24-hour, zero-padded — the axis and the marker flags share it. */
export function formatMinutesOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Ski seasons                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A ski season runs July → June, so "24/25" covers 1 Jul 2024 – 30 Jun 2025.
 * A date before July counts toward the season that started the previous July.
 */
export function seasonOf(date: Date): string {
  const startYear = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  const two = (y: number) => String(((y % 100) + 100) % 100).padStart(2, '0');
  return `${two(startYear)}/${two(startYear + 1)}`;
}

export type SeasonSplit = 'snow' | 'weather';

export type SeasonBar = {
  season: string;
  total: number;
  /** One entry per possible key, in `SNOW_CONDITIONS`/`WEATHER_CONDITIONS` order, zero-count keys included — every bar shares the same segment order so the legend lines up across seasons. */
  segments: { key: string; count: number }[];
};

/**
 * Snowboard days per season, stacked by snow condition or weather. Seasons
 * oldest first, so the chart reads left-to-right by time. A season with no
 * logs never appears — there is nothing to stack.
 */
export function snowboardSeasons(sportSessions: SportSession[], splitBy: SeasonSplit): SeasonBar[] {
  const keys: readonly string[] = splitBy === 'snow' ? SNOW_CONDITIONS : WEATHER_CONDITIONS;
  const bySeason = new Map<string, Map<string, number>>();

  for (const s of sportSessions) {
    if (s.kind !== 'snowboard') continue;
    const season = seasonOf(parseLocalDate(s.date));
    const perKey = bySeason.get(season) ?? new Map<string, number>();
    const key = splitBy === 'snow' ? s.snowCondition : s.weather;
    perKey.set(key, (perKey.get(key) ?? 0) + 1);
    bySeason.set(season, perKey);
  }

  return [...bySeason]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, perKey]) => ({
      season,
      total: [...perKey.values()].reduce((a, b) => a + b, 0),
      segments: keys.map((key) => ({ key, count: perKey.get(key) ?? 0 })),
    }));
}

/* -------------------------------------------------------------------------- */
/* Climbing                                                                    */
/* -------------------------------------------------------------------------- */

export type ClimbGradeCount = { grade: ClimbGrade; count: number };

/**
 * Climbs per grade over `range`, hardest grade first —
 * the shape a "pyramid" is expected to have, tapering from a short bar at the
 * hard end to a longer one at the easy end. Unlike `volumeByTarget`'s
 * open-ended muscle targets, `CLIMB_GRADES` is small and fixed, so every
 * grade is always present, zero-count included — dropping an untouched grade
 * would leave a hole in the pyramid rather than just shorten a list.
 */
export function climbGradePyramid(sportSessions: SportSession[], range: StatsRange): ClimbGradeCount[] {
  const totals = new Map<ClimbGrade, number>(CLIMB_GRADES.map((grade) => [grade, 0]));

  for (const s of sportSessions) {
    if (s.kind !== 'climbing') continue;
    if (!inRange(parseLocalDate(s.date), range)) continue;
    for (const grade of CLIMB_GRADES) {
      totals.set(grade, (totals.get(grade) ?? 0) + s.climbsByGrade[grade]);
    }
  }

  return [...CLIMB_GRADES].reverse().map((grade) => ({ grade, count: totals.get(grade) ?? 0 }));
}

/* -------------------------------------------------------------------------- */
/* Cycling                                                                     */
/* -------------------------------------------------------------------------- */

export type CyclingSummary = {
  rides: number;
  totalDistanceKm: number;
  totalElevationM: number;
  /** Total elevation over total distance, or null with no distance to divide by — an intensity figure, not loggable directly. */
  avgElevationPerKm: number | null;
};

/**
 * Totals over `range`. Distance and elevation are
 * summed rather than averaged — with infrequent rides a per-ride average
 * reads as a strange fractional ride, where a total answers "how much did I
 * ride" directly.
 */
export function cyclingSummary(sportSessions: SportSession[], range: StatsRange): CyclingSummary {
  let rides = 0;
  let totalDistanceKm = 0;
  let totalElevationM = 0;

  for (const s of sportSessions) {
    if (s.kind !== 'cycling') continue;
    if (!inRange(parseLocalDate(s.date), range)) continue;
    rides += 1;
    totalDistanceKm += s.distanceKm;
    totalElevationM += s.elevationM;
  }

  return {
    rides,
    totalDistanceKm,
    totalElevationM,
    avgElevationPerKm: totalDistanceKm > 0 ? totalElevationM / totalDistanceKm : null,
  };
}

export type CyclingRide = CyclingSession & {
  /** This ride's own elevation/distance, or null for a distance-less ride — same reasoning as `CyclingSummary.avgElevationPerKm`. */
  elevationPerKm: number | null;
};

/**
 * Individual rides in `range`, newest first — the list
 * that backs up the summary card with what actually happened on each ride,
 * the same "picture never holds a number on its own" rule the exercise
 * history charts follow.
 */
export function cyclingRides(sportSessions: SportSession[], range: StatsRange): CyclingRide[] {
  return sportSessions
    .filter((s): s is CyclingSession => s.kind === 'cycling')
    .filter((s) => inRange(parseLocalDate(s.date), range))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({ ...s, elevationPerKm: s.distanceKm > 0 ? s.elevationM / s.distanceKm : null }));
}
