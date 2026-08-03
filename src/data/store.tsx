/**
 * The single source of app state.
 *
 * Every page reads state and calls actions through `useGym()`. No page talks to
 * IndexedDB directly — actions write to the DB first and then update state, so
 * storage and UI never diverge and a mid-workout app kill loses nothing.
 *
 * Actions derive their next value by reading the DB rather than by closing over
 * React state: state updaters must stay pure (StrictMode invokes them twice),
 * and IndexedDB is the authority anyway.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from './db';
import { applyBackup, buildBackup, downloadBackup, parseBackup, type ImportMode } from './backup';
import { allLatestFor, allPersonalRecords, type LatestByExercise, type RecordsByExercise } from './derive';
import {
  CUSTOM_ID_PREFIX,
  customToExercise,
  downscaleImage,
  fetchRawExercises,
  normaliseExercise,
  revokeCustomUrls,
} from './exercises';
import {
  DEFAULT_SETTINGS,
  type ActiveSession,
  type Exercise,
  type Session,
  type Settings,
  type Training,
} from './types';

export type GymStatus = 'loading' | 'ready' | 'error';

export type GymState = {
  status: GymStatus;
  error: string | null;
  /** Built-in catalogue plus the user's custom exercises. */
  exercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  /** Ordered by the user's drag-reordered rotation. */
  trainings: Training[];
  /** Saved sessions, newest first. */
  sessions: Session[];
  active: ActiveSession | null;
  settings: Settings;
};

export type NewCustomExercise = {
  name: string;
  category: string;
  equipment: string;
  target: string;
};

type Mutations = {
  addCustomExercise: (input: NewCustomExercise, photo?: File | null) => Promise<Exercise>;

  addExerciseToTraining: (trainingId: string, exerciseId: string) => Promise<void>;
  removeExerciseFromTraining: (trainingId: string, exerciseId: string) => Promise<void>;

  addTraining: (label: string) => Promise<Training>;
  renameTraining: (trainingId: string, label: string) => Promise<void>;
  /** Full new rotation order, as dragged into place. */
  reorderTrainings: (orderedIds: string[]) => Promise<void>;

  /** Replaces any session already in progress — confirm with the user first. */
  startSession: (trainingId: string) => Promise<void>;
  addSet: (exerciseId: string, reps: number, weight: number) => Promise<void>;
  removeSet: (exerciseId: string, index: number) => Promise<void>;
  /** Returns the saved session, or null when nothing was logged. */
  saveSession: () => Promise<Session | null>;
  discardSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  setWeeklyGoal: (goal: number) => Promise<void>;
  exportNow: () => Promise<void>;
  importFrom: (file: File, mode: ImportMode) => Promise<void>;
};

type Lookups = {
  getExercise: (id: string) => Exercise | undefined;
  getTraining: (id: string) => Training | undefined;
};

type Derived = {
  /** Best-ever sets per exercise. Absent id = never logged with weight. */
  exerciseRecords: RecordsByExercise;
  /** Most recent logged occurrence per exercise. Absent id = never logged. */
  exerciseLatest: LatestByExercise;
};

export type Gym = GymState & Derived & Mutations & Lookups;

const GymContext = createContext<Gym | null>(null);

const INITIAL: GymState = {
  status: 'loading',
  error: null,
  exercises: [],
  exerciseById: new Map(),
  trainings: [],
  sessions: [],
  active: null,
  settings: DEFAULT_SETTINGS,
};

function byNewest(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function GymProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GymState>(INITIAL);

  /** Custom-exercise object URLs currently handed out, so they can be revoked. */
  const liveCustomExercises = useRef<Exercise[]>([]);
  const loadedOnce = useRef(false);

  /** Full reload from disk. Used on boot and after an import. */
  const reload = useCallback(async () => {
    const [rawExercises, trainings, custom, sessions, active, settings] = await Promise.all([
      fetchRawExercises(),
      db.getTrainings(),
      db.getCustomExercises(),
      db.getSessions(),
      db.getActiveSession(),
      db.getSettings(),
    ]);

    revokeCustomUrls(liveCustomExercises.current);
    const customExercises = custom.map(customToExercise);
    liveCustomExercises.current = customExercises;

    const exercises = [...rawExercises.map(normaliseExercise), ...customExercises];

    setState({
      status: 'ready',
      error: null,
      exercises,
      exerciseById: new Map(exercises.map((e) => [e.id, e])),
      trainings,
      sessions: byNewest(sessions),
      active,
      settings,
    });
  }, []);

  useEffect(() => {
    // StrictMode runs effects twice in dev; the catalogue only needs loading once.
    if (loadedOnce.current) return;
    loadedOnce.current = true;

    reload().catch((e: unknown) => {
      setState((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      }));
    });
  }, [reload]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Read the active session, transform it, persist, publish. */
  const mutateActive = useCallback(
    async (fn: (active: ActiveSession) => ActiveSession): Promise<void> => {
      const current = await db.getActiveSession();
      if (!current) return;
      const next = fn(current);
      await db.putActiveSession(next);
      setState((s) => ({ ...s, active: next }));
    },
    [],
  );

  const mutations = useMemo<Mutations>(
    () => ({
      async addCustomExercise(input, photo) {
        const imageBlob = photo ? await downscaleImage(photo) : null;
        const record = {
          id: `${CUSTOM_ID_PREFIX}${crypto.randomUUID()}`,
          name: input.name.trim(),
          category: input.category,
          equipment: input.equipment,
          target: input.target,
          imageBlob,
          createdAt: new Date().toISOString(),
        };
        await db.putCustomExercise(record);

        const exercise = customToExercise(record);
        liveCustomExercises.current = [...liveCustomExercises.current, exercise];

        setState((s) => {
          const exercises = [...s.exercises, exercise];
          return { ...s, exercises, exerciseById: new Map(exercises.map((e) => [e.id, e])) };
        });
        return exercise;
      },

      async addExerciseToTraining(trainingId, exerciseId) {
        const training = (await db.getTrainings()).find((t) => t.id === trainingId);
        if (!training || training.exerciseIds.includes(exerciseId)) return;

        const updated = { ...training, exerciseIds: [...training.exerciseIds, exerciseId] };
        await db.putTraining(updated);
        setState((s) => ({
          ...s,
          trainings: s.trainings.map((t) => (t.id === trainingId ? updated : t)),
        }));
      },

      async removeExerciseFromTraining(trainingId, exerciseId) {
        const training = (await db.getTrainings()).find((t) => t.id === trainingId);
        if (!training) return;

        const updated = {
          ...training,
          exerciseIds: training.exerciseIds.filter((id) => id !== exerciseId),
        };
        await db.putTraining(updated);
        setState((s) => ({
          ...s,
          trainings: s.trainings.map((t) => (t.id === trainingId ? updated : t)),
        }));
      },

      async addTraining(label) {
        const trimmed = label.trim();
        if (!trimmed) throw new Error('Name is required.');
        const training = await db.createTraining(trimmed);
        setState((s) => ({
          ...s,
          trainings: [...s.trainings, training].sort((a, b) => a.order - b.order),
        }));
        return training;
      },

      async renameTraining(trainingId, label) {
        const trimmed = label.trim();
        if (!trimmed) throw new Error('Name is required.');
        const updated = await db.renameTraining(trainingId, trimmed);
        if (!updated) return;
        setState((s) => ({
          ...s,
          trainings: s.trainings.map((t) => (t.id === trainingId ? updated : t)),
        }));
      },

      async reorderTrainings(orderedIds) {
        const trainings = await db.reorderTrainings(orderedIds);
        setState((s) => ({ ...s, trainings }));
      },

      async startSession(trainingId) {
        const training = (await db.getTrainings()).find((t) => t.id === trainingId);
        if (!training) throw new Error(`Unknown training: ${trainingId}`);

        const active: ActiveSession = {
          trainingId: training.id,
          trainingLabel: training.label,
          startedAt: new Date().toISOString(),
          entries: training.exerciseIds.map((exerciseId) => ({ exerciseId, sets: [] })),
        };
        await db.putActiveSession(active);
        setState((s) => ({ ...s, active }));
      },

      async addSet(exerciseId, reps, weight) {
        await mutateActive((active) => {
          const set = { reps, weight, at: new Date().toISOString() };
          const known = active.entries.some((e) => e.exerciseId === exerciseId);
          return {
            ...active,
            entries: known
              ? active.entries.map((e) =>
                  e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, set] } : e,
                )
              : [...active.entries, { exerciseId, sets: [set] }],
          };
        });
      },

      async removeSet(exerciseId, index) {
        await mutateActive((active) => ({
          ...active,
          entries: active.entries.map((e) =>
            e.exerciseId === exerciseId ? { ...e, sets: e.sets.filter((_, i) => i !== index) } : e,
          ),
        }));
      },

      async saveSession() {
        const active = await db.getActiveSession();
        if (!active) return null;
        if (active.entries.every((e) => e.sets.length === 0)) return null;

        const session: Session = {
          ...active,
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        };
        await db.putSession(session);
        await db.clearActiveSession();
        void db.requestPersistence();

        setState((s) => ({ ...s, active: null, sessions: byNewest([session, ...s.sessions]) }));
        return session;
      },

      async discardSession() {
        await db.clearActiveSession();
        setState((s) => ({ ...s, active: null }));
      },

      async deleteSession(id) {
        await db.deleteSession(id);
        setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
      },

      async setWeeklyGoal(goal) {
        const weeklyGoal = Math.max(1, Math.min(14, Math.round(goal)));
        await db.putSetting('weeklyGoal', weeklyGoal);
        setState((s) => ({ ...s, settings: { ...s.settings, weeklyGoal } }));
      },

      async exportNow() {
        downloadBackup(await buildBackup());
        const lastExportAt = new Date().toISOString();
        await db.putSetting('lastExportAt', lastExportAt);
        setState((s) => ({ ...s, settings: { ...s.settings, lastExportAt } }));
      },

      async importFrom(file, mode) {
        await applyBackup(parseBackup(await file.text()), mode);
        await reload();
      },
    }),
    [mutateActive, reload],
  );

  /**
   * Records and latest-occurrence live here rather than in the components
   * that read them: the Exercises carousel renders a card per exercise out of
   * a 1324-record catalogue, and each card scanning the whole history for its
   * own data would be O(cards × sessions) on every scroll. One pass each,
   * memoised on the `sessions` identity — every mutation replaces that array
   * wholesale, so identity is an exact invalidation key.
   */
  const exerciseRecords = useMemo(() => allPersonalRecords(state.sessions), [state.sessions]);
  const exerciseLatest = useMemo(() => allLatestFor(state.sessions), [state.sessions]);

  const value = useMemo<Gym>(
    () => ({
      ...state,
      ...mutations,
      exerciseRecords,
      exerciseLatest,
      getExercise: (id) => state.exerciseById.get(id),
      getTraining: (id) => state.trainings.find((t) => t.id === id),
    }),
    [state, mutations, exerciseRecords, exerciseLatest],
  );

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export function useGym(): Gym {
  const ctx = useContext(GymContext);
  if (!ctx) throw new Error('useGym must be used inside <GymProvider>');
  return ctx;
}
