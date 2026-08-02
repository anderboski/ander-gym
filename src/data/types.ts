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

/** One training day. Names/order come from data/training_days.txt; membership is the user's. */
export type Training = {
  id: string;
  label: string;
  order: number;
  exerciseIds: string[];
};

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
};

export const DEFAULT_SETTINGS: Settings = {
  weeklyGoal: 3,
  lastExportAt: null,
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
