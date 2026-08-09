/** Domain types. See SPEC.md §2–§3. */

/** A record exactly as it appears in data/exercises.json. */
export type RawExercise = {
  id: string;
  name: string;
  category: string;
  body_part: string;
  equipment: string;
  muscle_group: string;
  secondary_muscles: string[];
  target: string;
  image: string;
  gif_url: string;
  created_at: string;
};

/**
 * Normalised exercise, built-in or user-created.
 *
 * `body_part` is dropped (byte-identical to `category` on all 1324 records),
 * as are `muscle_group` (dirty vocabulary) and `gif_url` (points at a
 * data/videos/ directory that does not exist).
 */
export type Exercise = {
  id: string;
  name: string;
  category: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  /** Ready-to-use URL, base-path aware. Null when a custom exercise has no photo. */
  imageUrl: string | null;
  isCustom: boolean;
};

/** A user-created exercise as stored in IndexedDB. */
export type CustomExercise = {
  id: string;
  name: string;
  category: string;
  equipment: string;
  target: string;
  imageBlob: Blob | null;
  createdAt: string;
};

/**
 * One training day. Fully user-managed: created and renamed freely, reordered
 * by drag (order determines rotation), never deleted — a session's
 * `trainingId` must always resolve so history stays intact.
 */
export type Training = {
  id: string;
  label: string;
  order: number;
  exerciseIds: string[];
  /**
   * Rest countdown for this training day, in seconds. Optional on purpose:
   * absent means `DEFAULT_REST_SECONDS`, so every training created — and every
   * backup written — before the timer existed stays valid with no migration.
   */
  restSeconds?: number;
  /**
   * A single letter, symbol, or emoji shown on the Trainings row and the Home
   * calendar dot. Optional so every training created — and every backup
   * written — before this existed stays valid with no migration; absent means
   * fall back to the label's first letter, the pre-existing badge.
   */
  emoji?: string;
  /**
   * Archived trainings drop out of the Home rotation and the default
   * Trainings list but stay resolvable — history keeps working unchanged.
   * Optional so every training created before this existed stays valid with
   * no migration; absent means active, same as `false`.
   */
  archived?: boolean;
  /** Absent means `'gym'` — see `TrainingKind`. */
  kind?: TrainingKind;
};

export const TRAINING_ID_PREFIX = 't-';

/**
 * What a training day is for. Absent means `'gym'` — the only kind that
 * existed before sport sessions — so every training written before this
 * field existed stays valid with no migration. A `'gym'` training is the
 * existing shape: `exerciseIds`, rotation, live sessions with sets. A sport
 * kind never populates `exerciseIds`, is skipped by `nextTraining()`'s
 * rotation entirely, and logs to the separate `sportSessions` store instead
 * of `sessions` — summary stats filled in after the activity, not sets
 * tracked live. Fixed at creation; there is no UI to change a training's
 * kind afterward.
 */
export type TrainingKind = 'gym' | 'snowboard' | 'cycling' | 'climbing';

export const SPORT_KINDS = ['snowboard', 'cycling', 'climbing'] as const;
export type SportKind = (typeof SPORT_KINDS)[number];

/** Rest lengths offered inline in the session header, in seconds. */
export const REST_PRESETS = [60, 90, 120] as const;

export const DEFAULT_REST_SECONDS = 90;

/** Bounds every stored or imported rest duration is clamped into. */
export const REST_MIN_SECONDS = 15;
export const REST_MAX_SECONDS = 600;

export type SetEntry = {
  reps: number;
  /** Kilograms. 0 is valid (bodyweight). */
  weight: number;
  at: string;
};

export type SessionEntry = {
  exerciseId: string;
  sets: SetEntry[];
};

/** A session in progress. At most one exists at a time. */
export type ActiveSession = {
  trainingId: string;
  trainingLabel: string;
  startedAt: string;
  entries: SessionEntry[];
};

/** A completed, immutable session. */
export type Session = ActiveSession & {
  id: string;
  savedAt: string;
};

export const SPORT_SESSION_ID_PREFIX = 'ss-';

export type WeatherCondition = 'sunny' | 'cloudy' | 'snowing' | 'foggy' | 'windy';
export const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
  'sunny',
  'cloudy',
  'snowing',
  'foggy',
  'windy',
];

export type SnowCondition = 'powder' | 'packed' | 'icy' | 'slushy' | 'spring' | 'groomed';
export const SNOW_CONDITIONS: readonly SnowCondition[] = [
  'powder',
  'packed',
  'icy',
  'slushy',
  'spring',
  'groomed',
];

/** Whole grade buckets only — no French/Spanish a/b/c subgrades. */
export type ClimbGrade = '3' | '4' | '5';
export const CLIMB_GRADES: readonly ClimbGrade[] = ['3', '4', '5'];

type SportSessionBase = {
  id: string;
  trainingId: string;
  /** Snapshotted at log time, same reasoning as `Session.trainingLabel`. */
  trainingLabel: string;
  /** `YYYY-MM-DD`, local — logged after the fact, so a day, not a timestamp (same convention as `WeightCheckin.date`). */
  date: string;
  createdAt: string;
};

export type SnowboardSession = SportSessionBase & {
  kind: 'snowboard';
  weather: WeatherCondition;
  snowCondition: SnowCondition;
  comments: string;
};

export type CyclingSession = SportSessionBase & {
  kind: 'cycling';
  distanceKm: number;
  /** Total elevation gain, metres ("desnivel"). */
  elevationM: number;
  avgBpm: number | null;
};

export type ClimbingSession = SportSessionBase & {
  kind: 'climbing';
  climbsByGrade: Record<ClimbGrade, number>;
};

/** A logged, immutable sport activity — the non-gym equivalent of `Session`. No editing: delete and re-log to correct. */
export type SportSession = SnowboardSession | CyclingSession | ClimbingSession;

/** What a log form collects, before the store stamps identity fields on. */
export type NewSnowboardSession = Omit<SnowboardSession, 'id' | 'trainingId' | 'trainingLabel' | 'createdAt'>;
export type NewCyclingSession = Omit<CyclingSession, 'id' | 'trainingId' | 'trainingLabel' | 'createdAt'>;
export type NewClimbingSession = Omit<ClimbingSession, 'id' | 'trainingId' | 'trainingLabel' | 'createdAt'>;
export type NewSportSession = NewSnowboardSession | NewCyclingSession | NewClimbingSession;

export type Settings = {
  weeklyGoal: number;
  lastExportAt: string | null;
  /** Exercise ids starred from the Exercises finder, built-in or custom. */
  favoriteExerciseIds: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  weeklyGoal: 3,
  lastExportAt: null,
  favoriteExerciseIds: [],
};

/**
 * Static identity — things that rarely change. Current weight is deliberately
 * NOT here: it's the latest `WeightCheckin`, not a field that could drift out
 * of sync with the check-in history.
 */
export type Profile = {
  name: string;
  /** `YYYY-MM-DD`, local. Age is derived from this (derive.ts `ageFrom`), never stored. */
  birthdate: string | null;
  heightCm: number | null;
};

export const DEFAULT_PROFILE: Profile = {
  name: '',
  birthdate: null,
  heightCm: null,
};

export const CHECKIN_ID_PREFIX = 'ck-';

/** One weight log entry. Photos are optional and there can be more than one. */
export type WeightCheckin = {
  id: string;
  /** `YYYY-MM-DD`, local — a check-in is a day, not a timestamp. */
  date: string;
  weightKg: number;
  photoBlobs: Blob[];
};

/** Facet keys the Exercises filter exposes, in on-screen order. */
export const FACET_KEYS = ['category', 'equipment', 'target'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export type Facets = Record<FacetKey, string[]>;

export const EMPTY_FACETS: Facets = { category: [], equipment: [], target: [] };
