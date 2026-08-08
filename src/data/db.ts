/**
 * IndexedDB access. Everything the user creates lives here; nothing leaves the
 * device. See SPEC.md §3.
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  TRAINING_ID_PREFIX,
  type ActiveSession,
  type CustomExercise,
  type Profile,
  type Session,
  type Settings,
  type Training,
  type WeightCheckin,
} from './types';

export const DB_NAME = 'ander-gym';
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 2;

/** The single key used by the activeSession store. */
const ACTIVE_KEY = 'current';

interface GymDB extends DBSchema {
  trainings: { key: string; value: Training };
  sessions: { key: string; value: Session; indexes: { startedAt: string } };
  activeSession: { key: string; value: ActiveSession };
  customExercises: { key: string; value: CustomExercise };
  settings: { key: string; value: unknown };
  profile: { key: string; value: unknown };
  checkins: { key: string; value: WeightCheckin; indexes: { date: string } };
}

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GymDB>> {
  dbPromise ??= openDB<GymDB>(DB_NAME, DB_VERSION, {
    // Version-aware from here on: every store below already exists on real
    // devices at `oldVersion` 1, so it can only ever be created once. Adding
    // a store for the next version means a new `if` block, never touching
    // the ones before it — this is the app's first migration, so treat this
    // shape as the template for the next one.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('trainings', { keyPath: 'id' });
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('startedAt', 'startedAt');
        db.createObjectStore('activeSession');
        db.createObjectStore('customExercises', { keyPath: 'id' });
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        db.createObjectStore('profile');
        const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
        checkins.createIndex('date', 'date');
      }
    },
    // A second tab/instance holding an older connection open would otherwise
    // block the upgrade transaction indefinitely with no feedback. Blunt but
    // honest: a full reload is the only way to actually release that old
    // connection, and this is the first version bump this app has ever had.
    blocked() {
      window.alert('ander-gym needs to update its storage — please close any other open tabs of this app and reload.');
    },
    blocking() {
      window.location.reload();
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

/** Creates a training day with no exercises yet, appended to the end of the rotation. */
export async function createTraining(label: string): Promise<Training> {
  const existing = await getTrainings();
  const order = existing.reduce((max, t) => Math.max(max, t.order + 1), 0);
  const training: Training = {
    id: `${TRAINING_ID_PREFIX}${crypto.randomUUID()}`,
    label,
    order,
    exerciseIds: [],
  };
  await putTraining(training);
  return training;
}

/**
 * Renames a training in place — the id (and therefore every session's
 * `trainingId`) never changes, so history stays intact.
 */
export async function renameTraining(id: string, label: string): Promise<Training | null> {
  const training = (await getTrainings()).find((t) => t.id === id);
  if (!training) return null;
  const updated = { ...training, label };
  await putTraining(updated);
  return updated;
}

/**
 * Sets this training day's rest default. Callers clamp the value first; nothing
 * else about the training is touched, so an old record simply gains the field.
 */
export async function setTrainingRest(id: string, restSeconds: number): Promise<Training | null> {
  const training = (await getTrainings()).find((t) => t.id === id);
  if (!training) return null;
  const updated = { ...training, restSeconds };
  await putTraining(updated);
  return updated;
}

/**
 * Sets this training day's icon. `null` clears it back to the first-letter
 * fallback; callers reduce the value to a single grapheme first, so nothing
 * else about the training is touched, an old record simply gains the field.
 */
export async function setTrainingEmoji(id: string, emoji: string | null): Promise<Training | null> {
  const training = (await getTrainings()).find((t) => t.id === id);
  if (!training) return null;
  const updated: Training = { ...training };
  if (emoji) updated.emoji = emoji;
  else delete updated.emoji;
  await putTraining(updated);
  return updated;
}

/**
 * Archives or unarchives a training day. Archiving never touches history —
 * every session already has its `trainingId` and a snapshotted
 * `trainingLabel`, so nothing downstream needs the training to be active.
 */
export async function archiveTraining(id: string, archived: boolean): Promise<Training | null> {
  const training = (await getTrainings()).find((t) => t.id === id);
  if (!training) return null;
  const updated: Training = { ...training };
  if (archived) updated.archived = true;
  else delete updated.archived;
  await putTraining(updated);
  return updated;
}

/**
 * True deletion, only ever safe to offer when the caller has confirmed no
 * session references this training — otherwise a `Session.trainingId` would
 * stop resolving.
 */
export async function deleteTraining(id: string): Promise<void> {
  await (await getDB()).delete('trainings', id);
}

/**
 * Applies a new rotation order from a full list of training ids (as dragged
 * into place). Any id missing from `orderedIds` — should not normally happen
 * — is kept, appended after the given ones in its previous relative order.
 */
export async function reorderTrainings(orderedIds: string[]): Promise<Training[]> {
  const existing = await getTrainings();
  const byId = new Map(existing.map((t) => [t.id, t]));
  const known = orderedIds.filter((id) => byId.has(id));
  const leftover = existing.filter((t) => !known.includes(t.id));

  const db = await getDB();
  const tx = db.transaction('trainings', 'readwrite');
  const store = tx.objectStore('trainings');
  let order = 0;
  for (const id of known) await store.put({ ...byId.get(id)!, order: order++ });
  for (const t of leftover) await store.put({ ...t, order: order++ });
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
  const favoriteExerciseIds = await db.get('settings', 'favoriteExerciseIds');
  return {
    weeklyGoal: typeof weeklyGoal === 'number' ? weeklyGoal : DEFAULT_SETTINGS.weeklyGoal,
    lastExportAt: typeof lastExportAt === 'string' ? lastExportAt : null,
    favoriteExerciseIds: Array.isArray(favoriteExerciseIds) ? favoriteExerciseIds : [],
  };
}

export async function putSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await (await getDB()).put('settings', value, key);
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

export async function getProfile(): Promise<Profile> {
  const db = await getDB();
  const name = await db.get('profile', 'name');
  const birthdate = await db.get('profile', 'birthdate');
  const heightCm = await db.get('profile', 'heightCm');
  return {
    name: typeof name === 'string' ? name : DEFAULT_PROFILE.name,
    birthdate: typeof birthdate === 'string' ? birthdate : null,
    heightCm: typeof heightCm === 'number' ? heightCm : null,
  };
}

export async function putProfileField<K extends keyof Profile>(
  key: K,
  value: Profile[K],
): Promise<void> {
  await (await getDB()).put('profile', value, key);
}

/* -------------------------------------------------------------------------- */
/* Weight check-ins                                                            */
/* -------------------------------------------------------------------------- */

export async function getCheckins(): Promise<WeightCheckin[]> {
  return (await getDB()).getAll('checkins');
}

export async function putCheckin(checkin: WeightCheckin): Promise<void> {
  await (await getDB()).put('checkins', checkin);
}

export async function deleteCheckin(id: string): Promise<void> {
  await (await getDB()).delete('checkins', id);
}

/* -------------------------------------------------------------------------- */
/* Bulk (backup / restore)                                                     */
/* -------------------------------------------------------------------------- */

export async function readAll(): Promise<{
  trainings: Training[];
  sessions: Session[];
  customExercises: CustomExercise[];
  settings: Settings;
  profile: Profile;
  checkins: WeightCheckin[];
}> {
  return {
    trainings: await getTrainings(),
    sessions: await getSessions(),
    customExercises: await getCustomExercises(),
    settings: await getSettings(),
    profile: await getProfile(),
    checkins: await getCheckins(),
  };
}

/** Wipes every user store. Used by "Replace" on import. */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['trainings', 'sessions', 'activeSession', 'customExercises', 'settings', 'profile', 'checkins'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('trainings').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('activeSession').clear(),
    tx.objectStore('customExercises').clear(),
    tx.objectStore('profile').clear(),
    tx.objectStore('checkins').clear(),
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
