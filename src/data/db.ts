/**
 * IndexedDB access. Everything the user creates lives here; nothing leaves the
 * device. See SPEC.md §3.
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { DEFAULT_SETTINGS, type ActiveSession, type CustomExercise, type Session, type Settings, type Training } from './types';

export const DB_NAME = 'ander-gym';
export const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

/** The single key used by the activeSession store. */
const ACTIVE_KEY = 'current';

interface GymDB extends DBSchema {
  trainings: { key: string; value: Training };
  sessions: { key: string; value: Session; indexes: { startedAt: string } };
  activeSession: { key: string; value: ActiveSession };
  customExercises: { key: string; value: CustomExercise };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GymDB>> {
  dbPromise ??= openDB<GymDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('trainings', { keyPath: 'id' });
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('startedAt', 'startedAt');
      db.createObjectStore('activeSession');
      db.createObjectStore('customExercises', { keyPath: 'id' });
      db.createObjectStore('settings');
    },
  });
  return dbPromise;
}

/**
 * Close the connection and drop the cache. Required before deleteDB — an open
 * connection blocks deletion indefinitely rather than failing.
 */
export async function closeDB(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  (await pending).close();
}

/* -------------------------------------------------------------------------- */
/* Trainings                                                                   */
/* -------------------------------------------------------------------------- */

export async function getTrainings(): Promise<Training[]> {
  const all = await (await getDB()).getAll('trainings');
  return all.sort((a, b) => a.order - b.order);
}

export async function putTraining(training: Training): Promise<void> {
  await (await getDB()).put('trainings', training);
}

/**
 * Reconcile the stored trainings against data/training_days.txt.
 *
 * Insert new lines, refresh label/order on existing ones, and never delete a
 * training the user has put exercises into — a line removed from the file
 * keeps its data and is pushed to the end of the rotation.
 */
export async function seedTrainings(
  parsed: { id: string; label: string; order: number }[],
): Promise<Training[]> {
  const db = await getDB();
  const tx = db.transaction('trainings', 'readwrite');
  const store = tx.objectStore('trainings');
  const existing = await store.getAll();
  const byId = new Map(existing.map((t) => [t.id, t]));
  const fromFile = new Set(parsed.map((p) => p.id));

  for (const p of parsed) {
    const prev = byId.get(p.id);
    await store.put({
      id: p.id,
      label: p.label,
      order: p.order,
      exerciseIds: prev?.exerciseIds ?? [],
    });
  }

  // Orphans: kept, but ordered after everything still in the file.
  let tail = parsed.length;
  for (const t of existing) {
    if (fromFile.has(t.id)) continue;
    await store.put({ ...t, order: tail++ });
  }

  await tx.done;
  return getTrainings();
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSessions(): Promise<Session[]> {
  return (await getDB()).getAll('sessions');
}

export async function putSession(session: Session): Promise<void> {
  await (await getDB()).put('sessions', session);
}

export async function deleteSession(id: string): Promise<void> {
  await (await getDB()).delete('sessions', id);
}

/* -------------------------------------------------------------------------- */
/* Active session                                                              */
/* -------------------------------------------------------------------------- */

export async function getActiveSession(): Promise<ActiveSession | null> {
  return (await (await getDB()).get('activeSession', ACTIVE_KEY)) ?? null;
}

export async function putActiveSession(session: ActiveSession): Promise<void> {
  await (await getDB()).put('activeSession', session, ACTIVE_KEY);
}

export async function clearActiveSession(): Promise<void> {
  await (await getDB()).delete('activeSession', ACTIVE_KEY);
}

/* -------------------------------------------------------------------------- */
/* Custom exercises                                                            */
/* -------------------------------------------------------------------------- */

export async function getCustomExercises(): Promise<CustomExercise[]> {
  return (await getDB()).getAll('customExercises');
}

export async function putCustomExercise(exercise: CustomExercise): Promise<void> {
  await (await getDB()).put('customExercises', exercise);
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await (await getDB()).delete('customExercises', id);
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const weeklyGoal = await db.get('settings', 'weeklyGoal');
  const lastExportAt = await db.get('settings', 'lastExportAt');
  return {
    weeklyGoal: typeof weeklyGoal === 'number' ? weeklyGoal : DEFAULT_SETTINGS.weeklyGoal,
    lastExportAt: typeof lastExportAt === 'string' ? lastExportAt : null,
  };
}

export async function putSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await (await getDB()).put('settings', value, key);
}

/* -------------------------------------------------------------------------- */
/* Bulk (backup / restore)                                                     */
/* -------------------------------------------------------------------------- */

export async function readAll(): Promise<{
  trainings: Training[];
  sessions: Session[];
  customExercises: CustomExercise[];
  settings: Settings;
}> {
  return {
    trainings: await getTrainings(),
    sessions: await getSessions(),
    customExercises: await getCustomExercises(),
    settings: await getSettings(),
  };
}

/** Wipes every user store. Used by "Replace" on import. */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['trainings', 'sessions', 'activeSession', 'customExercises', 'settings'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('trainings').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('activeSession').clear(),
    tx.objectStore('customExercises').clear(),
    tx.objectStore('settings').clear(),
    tx.done,
  ]);
}

/** Ask Safari not to evict our storage. Best-effort, safe to call repeatedly. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
