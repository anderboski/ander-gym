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
};

export const TRAINING_ID_PREFIX = 't-';

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

/** Facet keys the Exercises filter exposes, in on-screen order. */
export const FACET_KEYS = ['category', 'equipment', 'target'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  category: 'Category',
  equipment: 'Equipment',
  target: 'Target muscle',
};

export type Facets = Record<FacetKey, string[]>;

export const EMPTY_FACETS: Facets = { category: [], equipment: [], target: [] };
