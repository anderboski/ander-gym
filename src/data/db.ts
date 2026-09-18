/**
 * IndexedDB access. Everything the user creates lives here; nothing leaves the
 * device. See SPEC.md §3.
 */
import { openDB, type IDBPDatabase, type DBSchema, type StoreNames } from 'idb';
import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  TRAINING_ID_PREFIX,
  type ActiveSession,
  type CustomExercise,
  type Profile,
  type Session,
  type Settings,
  type SportSession,
  type Training,
  type TrainingKind,
  type WeightCheckin,
} from './types';

export const DB_NAME = 'ander-gym';
export const DB_VERSION = 3;
export const SCHEMA_VERSION = 3;

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
  sportSessions: { key: string; value: SportSession; indexes: { date: string } };
}

/** Every user store, in one place so `clearAll` and the upgrade path cannot drift apart. */
const ALL_STORES: StoreNames<GymDB>[] = [
  'trainings',
  'sessions',
  'activeSession',
  'customExercises',
  'settings',
  'profile',
  'checkins',
  'sportSessions',
];

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GymDB>> {
  dbPromise ??= openDB<GymDB>(DB_NAME, DB_VERSION, {
    // Version-aware: every store below already exists on real devices at
    // `oldVersion` 1, so it can only ever be created once. Adding a store for
    // the next version means a new `if` block, never touching the ones before.
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
      if (oldVersion < 3) {
        const sportSessions = db.createObjectStore('sportSessions', { keyPath: 'id' });
        sportSessions.createIndex('date', 'date');
      }
    },
    // A second tab holding an older connection open would otherwise block the
    // upgrade transaction indefinitely with no feedback. Blunt but honest: a
    // full reload is the only way to actually release that old connection.
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

/**
 * Read-modify-write one training by key. Every field-level setter below goes
 * through here — and the store composes exercise add/remove/sync on it — so
 * nothing has to load the whole list to change one record. Returns null when
 * the id resolves to nothing.
 */
export async function updateTraining(
  id: string,
  change: (training: Training) => Training,
): Promise<Training | null> {
  const db = await getDB();
  const training = await db.get('trainings', id);
  if (!training) return null;
  const updated = change(training);
  await db.put('trainings', updated);
  return updated;
}

/**
 * Creates a training day with no exercises yet, appended to the end of the
 * rotation. `kind` is omitted from the record for `'gym'` (or when absent) —
 * same "absent means the pre-existing default" convention as `archived`.
 */
export async function createTraining(label: string, kind?: TrainingKind): Promise<Training> {
  const existing = await getTrainings();
  const order = existing.reduce((max, t) => Math.max(max, t.order + 1), 0);
  const training: Training = {
    id: `${TRAINING_ID_PREFIX}${crypto.randomUUID()}`,
    label,
    order,
    exerciseIds: [],
  };
  if (kind && kind !== 'gym') training.kind = kind;
  await putTraining(training);
  return training;
}

/**
 * Renames a training in place — the id (and therefore every session's
 * `trainingId`) never changes, so history stays intact.
 */
export function renameTraining(id: string, label: string): Promise<Training | null> {
  return updateTraining(id, (t) => ({ ...t, label }));
}

/** Sets this training day's rest default. Callers clamp the value first. */
export function setTrainingRest(id: string, restSeconds: number): Promise<Training | null> {
  return updateTraining(id, (t) => ({ ...t, restSeconds }));
}

/**
 * Sets this training day's icon. `null` clears it back to the first-letter
 * fallback; callers reduce the value to a single grapheme first.
 */
export function setTrainingEmoji(id: string, emoji: string | null): Promise<Training | null> {
  return updateTraining(id, (t) => {
    const updated: Training = { ...t };
    if (emoji) updated.emoji = emoji;
    else delete updated.emoji;
    return updated;
  });
}

/**
 * Archives or unarchives a training day. Archiving never touches history —
 * every session already has its `trainingId` and a snapshotted
 * `trainingLabel`, so nothing downstream needs the training to be active.
 */
export function archiveTraining(id: string, archived: boolean): Promise<Training | null> {
  return updateTraining(id, (t) => {
    const updated: Training = { ...t };
    if (archived) updated.archived = true;
    else delete updated.archived;
    return updated;
  });
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
  const known = new Set(orderedIds.filter((id) => byId.has(id)));
  const ordered = [...known].map((id) => byId.get(id)!).concat(existing.filter((t) => !known.has(t.id)));

  const db = await getDB();
  const tx = db.transaction('trainings', 'readwrite');
  await Promise.all([...ordered.map((t, order) => tx.store.put({ ...t, order })), tx.done]);

  return getTrainings();
}

/**
 * Applies a new exercise order within one training, from the full dragged
 * sequence — same "known ids first, any leftover appended" shape as
 * `reorderTrainings`, but rewriting `exerciseIds` in place.
 */
export function reorderTrainingExercises(
  id: string,
  orderedExerciseIds: string[],
): Promise<Training | null> {
  return updateTraining(id, (t) => {
    const current = new Set(t.exerciseIds);
    const known = orderedExerciseIds.filter((exId) => current.has(exId));
    const seen = new Set(known);
    return { ...t, exerciseIds: [...known, ...t.exerciseIds.filter((exId) => !seen.has(exId))] };
  });
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
/* Sport sessions                                                              */
/* -------------------------------------------------------------------------- */

export async function getSportSessions(): Promise<SportSession[]> {
  return (await getDB()).getAll('sportSessions');
}

export async function putSportSession(session: SportSession): Promise<void> {
  await (await getDB()).put('sportSessions', session);
}

export async function deleteSportSession(id: string): Promise<void> {
  await (await getDB()).delete('sportSessions', id);
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

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const [weeklyGoal, lastExportAt, favoriteExerciseIds] = await Promise.all([
    db.get('settings', 'weeklyGoal'),
    db.get('settings', 'lastExportAt'),
    db.get('settings', 'favoriteExerciseIds'),
  ]);
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
  const [name, birthdate, heightCm] = await Promise.all([
    db.get('profile', 'name'),
    db.get('profile', 'birthdate'),
    db.get('profile', 'heightCm'),
  ]);
  return {
    name: typeof name === 'string' ? name : DEFAULT_PROFILE.name,
    birthdate: typeof birthdate === 'string' ? birthdate : null,
    heightCm: typeof heightCm === 'number' ? heightCm : null,
  };
}

/** Writes every profile field in one transaction — the edit sheet saves them all at once. */
export async function putProfile(profile: Profile): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('profile', 'readwrite');
  await Promise.all([
    tx.store.put(profile.name, 'name'),
    tx.store.put(profile.birthdate, 'birthdate'),
    tx.store.put(profile.heightCm, 'heightCm'),
    tx.done,
  ]);
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

export type Snapshot = {
  trainings: Training[];
  sessions: Session[];
  customExercises: CustomExercise[];
  settings: Settings;
  profile: Profile;
  checkins: WeightCheckin[];
  sportSessions: SportSession[];
};

export async function readAll(): Promise<Snapshot> {
  const [trainings, sessions, customExercises, settings, profile, checkins, sportSessions] =
    await Promise.all([
      getTrainings(),
      getSessions(),
      getCustomExercises(),
      getSettings(),
      getProfile(),
      getCheckins(),
      getSportSessions(),
    ]);
  return { trainings, sessions, customExercises, settings, profile, checkins, sportSessions };
}

/**
 * Writes a whole snapshot in one transaction, so an import is all-or-nothing:
 * a record that fails to write (a quota error halfway through a large file)
 * rolls the rest back instead of leaving the device half-restored. Existing
 * records with the same id are overwritten; nothing else is touched — the
 * caller decides whether to `clearAll` first (Replace) or not (Merge).
 */
export async function writeAll(snapshot: Snapshot): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['trainings', 'sessions', 'customExercises', 'settings', 'profile', 'checkins', 'sportSessions'],
    'readwrite',
  );
  const settings = tx.objectStore('settings');
  const profile = tx.objectStore('profile');
  await Promise.all([
    ...snapshot.trainings.map((t) => tx.objectStore('trainings').put(t)),
    ...snapshot.sessions.map((s) => tx.objectStore('sessions').put(s)),
    ...snapshot.customExercises.map((c) => tx.objectStore('customExercises').put(c)),
    ...snapshot.checkins.map((c) => tx.objectStore('checkins').put(c)),
    ...snapshot.sportSessions.map((s) => tx.objectStore('sportSessions').put(s)),
    settings.put(snapshot.settings.weeklyGoal, 'weeklyGoal'),
    settings.put(snapshot.settings.lastExportAt, 'lastExportAt'),
    settings.put(snapshot.settings.favoriteExerciseIds, 'favoriteExerciseIds'),
    profile.put(snapshot.profile.name, 'name'),
    profile.put(snapshot.profile.birthdate, 'birthdate'),
    profile.put(snapshot.profile.heightCm, 'heightCm'),
    tx.done,
  ]);
}

/** Wipes every user store. Used by "Replace" on import. */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  await Promise.all([...ALL_STORES.map((name) => tx.objectStore(name).clear()), tx.done]);
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
