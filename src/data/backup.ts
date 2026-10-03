/**
 * Manual JSON backup. This is the only defence against device loss and against
 * Safari evicting IndexedDB, so the format is deliberately plain and complete.
 */
import { SCHEMA_VERSION, clearAll, readAll, writeAll } from './db';
import { firstGrapheme, parseRestSeconds } from './parse';
import { CLIMB_GRADES, SNOW_CONDITIONS, SPORT_KINDS, WEATHER_CONDITIONS } from './types';
import type {
  ClimbGrade,
  CustomExercise,
  Profile,
  Session,
  SessionEntry,
  SetEntry,
  Settings,
  SportSession,
  Training,
  WeightCheckin,
} from './types';

/** A custom exercise with its photo inlined, so a backup is a single file. */
export type BackupCustomExercise = Omit<CustomExercise, 'imageBlob'> & {
  /** `data:image/jpeg;base64,...` or null. */
  image: string | null;
};

/** A check-in with its photos inlined, same reasoning as customExercises. */
export type BackupWeightCheckin = Omit<WeightCheckin, 'photoBlobs'> & {
  photos: string[];
};

/** The profile with its photo inlined, same reasoning as customExercises. */
export type BackupProfile = Omit<Profile, 'photoBlob'> & {
  /** `data:image/jpeg;base64,...` or null. */
  photo: string | null;
};

export type BackupFile = {
  schemaVersion: number;
  /** Null for a hand-made or truncated file that carries no usable timestamp. */
  exportedAt: string | null;
  trainings: Training[];
  sessions: Session[];
  customExercises: BackupCustomExercise[];
  settings: Settings;
  profile: BackupProfile;
  checkins: BackupWeightCheckin[];
  sportSessions: SportSession[];
};

export type ImportMode = 'merge' | 'replace';

/* -------------------------------------------------------------------------- */
/* base64 <-> Blob (works in both the browser and Node test env)                */
/* -------------------------------------------------------------------------- */

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked to stay clear of the argument-count limit on large photos.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/* -------------------------------------------------------------------------- */

export async function buildBackup(): Promise<BackupFile> {
  const { trainings, sessions, customExercises, settings, profile, checkins, sportSessions } =
    await readAll();

  const withImages: BackupCustomExercise[] = await Promise.all(
    customExercises.map(async ({ imageBlob, ...rest }) => ({
      ...rest,
      image: imageBlob ? await blobToDataUrl(imageBlob) : null,
    })),
  );

  const withPhotos: BackupWeightCheckin[] = await Promise.all(
    checkins.map(async ({ photoBlobs, ...rest }) => ({
      ...rest,
      photos: await Promise.all(photoBlobs.map(blobToDataUrl)),
    })),
  );

  const { photoBlob, ...profileFields } = profile;

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    trainings,
    sessions,
    customExercises: withImages,
    settings,
    profile: { ...profileFields, photo: photoBlob ? await blobToDataUrl(photoBlob) : null },
    checkins: withPhotos,
    sportSessions,
  };
}

export function backupFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ander-gym-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function backupBlob(backup: BackupFile): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

/**
 * Trigger a file download. Uses an object URL + synthetic click, which is what
 * iOS Safari supports — there is no File System Access API on iOS.
 */
function downloadBackup(backup: BackupFile, filename = backupFilename()): void {
  const blob = backupBlob(backup);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari a moment to start the download before the URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hand the backup to the OS, preferring the share sheet.
 *
 * The download path drops the file into Downloads, which on a phone is the
 * one place a "this is your only copy" file is least likely to outlive the
 * device — the whole point of the export. The share sheet reaches Files,
 * iCloud Drive, Mail: somewhere that survives the phone. Everything else
 * (desktop browsers, older WebKit, anything that refuses a file payload)
 * falls back to the download, so nothing is lost by trying.
 *
 * `canShare({ files })` is the only honest feature test — Safari exposed
 * `navigator.share` for years before it would accept a file.
 */
export async function deliverBackup(
  backup: BackupFile,
  filename = backupFilename(),
): Promise<ExportOutcome> {
  const file = new File([backupBlob(backup)], filename, { type: 'application/json' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      // Dismissing the share sheet is a cancel, not a failure: the caller must
      // not record an export for a file that never left the device.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Anything else — a stale user gesture, a share target that refused the
      // file — still has the download below to fall through to.
    }
  }

  downloadBackup(backup, filename);
  return 'downloaded';
}

/** What an import is about to bring in, for the preview shown before Merge/Replace. */
export type BackupSummary = {
  trainings: number;
  sessions: number;
  sportSessions: number;
  customExercises: number;
  checkins: number;
  /** When the file was written, or null when it does not say. */
  exportedAt: string | null;
};

/**
 * Counts for the import preview. Replace wipes the device, so what the file
 * actually holds has to be readable *before* that choice is made — a backup
 * that turns out to be an empty or months-old export is exactly the mistake
 * a confirmation dialog alone cannot catch.
 */
export function summariseBackup(backup: BackupFile): BackupSummary {
  return {
    trainings: backup.trainings.length,
    sessions: backup.sessions.length,
    sportSessions: backup.sportSessions.length,
    customExercises: backup.customExercises.length,
    checkins: backup.checkins.length,
    exportedAt: backup.exportedAt,
  };
}

/**
 * `code` (plus optional `vars` for interpolation) lets a translated UI show
 * this in the user's chosen language — this module has no hook access, so it
 * cannot call `t()` itself. `message` stays a plain-English fallback for
 * anywhere that just logs the error.
 */
export type BackupErrorCode = 'invalid-json' | 'not-a-backup' | 'newer-schema' | 'missing-data';

export class BackupError extends Error {
  code: BackupErrorCode;
  vars?: Record<string, string | number>;

  constructor(code: BackupErrorCode, message: string, vars?: Record<string, string | number>) {
    super(message);
    this.code = code;
    this.vars = vars;
  }
}

/**
 * Trainings are trusted as written, with one exception: `restSeconds` feeds a
 * countdown deadline, so a hand-edited file (or one from before the field
 * existed, where it may be anything) must not be able to put a NaN there. An
 * unusable value is dropped rather than corrected — the training then falls
 * back to the app default, which is what a training without the field means.
 */
function withValidRest(training: Training): Training {
  const restSeconds = parseRestSeconds(training.restSeconds);
  const clean: Training = { ...training };
  if (restSeconds === null) delete clean.restSeconds;
  else clean.restSeconds = restSeconds;
  return clean;
}

/**
 * `emoji` is rendered directly as a UI glyph, so a hand-edited or corrupted
 * file must not be able to put arbitrary text there. Anything that isn't
 * already exactly one grapheme cluster is dropped rather than truncated — the
 * training then falls back to its first-letter badge, same as a training that
 * never had an icon.
 */
function withValidEmoji(training: Training): Training {
  const clean: Training = { ...training };
  if (training.emoji && firstGrapheme(training.emoji) !== training.emoji) delete clean.emoji;
  return clean;
}

/* -------------------------------------------------------------------------- */
/* Record validation                                                          */
/* -------------------------------------------------------------------------- */

/*
 * A backup is user-supplied input: anyone can hand-edit one, and a truncated
 * or foreign file still parses as JSON. Each collection is filtered here, at
 * parse time, so a malformed record is dropped before it reaches IndexedDB —
 * and because the import preview counts the *parsed* file, the numbers shown
 * before Merge/Replace already exclude anything that will be dropped.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strOr = (v: unknown, fallback: string): string => (isStr(v) ? v : fallback);

/**
 * Only a well-formed base64 image data URL. Checked up front because
 * `dataUrlToBlob` runs `atob`, which throws on bad base64 — and it runs in
 * `applyBackup` after the user has already confirmed the import.
 */
const IMAGE_DATA_URL = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/;
const isImageDataUrl = (v: unknown): v is string => isStr(v) && IMAGE_DATA_URL.test(v);

/**
 * Trainings are never dropped for anything but a missing id: a session whose
 * `trainingId` stops resolving breaks history, so a training with a usable id
 * is repaired field by field instead (empty label, file position as order).
 */
function toTraining(v: unknown, index: number): Training | null {
  if (!isObj(v) || !isStr(v.id)) return null;
  const training: Training = {
    ...(v as Partial<Training>),
    id: v.id,
    label: strOr(v.label, ''),
    order: isNum(v.order) ? v.order : index,
    exerciseIds: Array.isArray(v.exerciseIds) ? v.exerciseIds.filter(isStr) : [],
  };
  if (!isStr(v.emoji)) delete training.emoji;
  if (typeof v.archived !== 'boolean') delete training.archived;
  // An unknown kind would match no page; absent already means 'gym'.
  if (v.kind !== 'gym' && !SPORT_KINDS.some((k) => k === v.kind)) delete training.kind;
  return training;
}

function toSet(v: unknown): SetEntry | null {
  if (!isObj(v) || !isNum(v.reps) || !isNum(v.weight) || !isStr(v.at)) return null;
  return { reps: v.reps, weight: v.weight, at: v.at };
}

function toEntry(v: unknown): SessionEntry | null {
  if (!isObj(v) || !isStr(v.exerciseId)) return null;
  const sets = Array.isArray(v.sets) ? v.sets.map(toSet).filter((s) => s !== null) : [];
  return { exerciseId: v.exerciseId, sets };
}

function toSession(v: unknown): Session | null {
  if (!isObj(v)) return null;
  const { id, trainingId, trainingLabel, startedAt, savedAt, entries } = v;
  if (!isStr(id) || !isStr(trainingId) || !isStr(startedAt) || !isStr(savedAt)) return null;
  if (!Array.isArray(entries)) return null;
  return {
    id,
    trainingId,
    trainingLabel: strOr(trainingLabel, ''),
    startedAt,
    savedAt,
    entries: entries.map(toEntry).filter((e) => e !== null),
  };
}

function toSportSession(v: unknown): SportSession | null {
  if (!isObj(v)) return null;
  const { id, trainingId, trainingLabel, date, createdAt } = v;
  if (!isStr(id) || !isStr(trainingId) || !isStr(date) || !isStr(createdAt)) return null;
  const base = { id, trainingId, trainingLabel: strOr(trainingLabel, ''), date, createdAt };
  switch (v.kind) {
    case 'snowboard': {
      const weather = WEATHER_CONDITIONS.find((w) => w === v.weather);
      const snowCondition = SNOW_CONDITIONS.find((c) => c === v.snowCondition);
      if (!weather || !snowCondition) return null;
      return { ...base, kind: 'snowboard', weather, snowCondition, comments: strOr(v.comments, '') };
    }
    case 'cycling': {
      if (!isNum(v.distanceKm) || !isNum(v.elevationM)) return null;
      const avgBpm = isNum(v.avgBpm) ? v.avgBpm : null;
      return { ...base, kind: 'cycling', distanceKm: v.distanceKm, elevationM: v.elevationM, avgBpm };
    }
    case 'climbing': {
      const raw = v.climbsByGrade;
      if (!isObj(raw)) return null;
      const climbsByGrade = {} as Record<ClimbGrade, number>;
      for (const grade of CLIMB_GRADES) {
        const n = raw[grade];
        climbsByGrade[grade] = isNum(n) ? n : 0;
      }
      return { ...base, kind: 'climbing', climbsByGrade };
    }
    case 'other':
      return { ...base, kind: 'other', comments: strOr(v.comments, '') };
    default:
      return null;
  }
}

function toCustomExercise(v: unknown): BackupCustomExercise | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name)) return null;
  return {
    id: v.id,
    name: v.name,
    category: strOr(v.category, ''),
    equipment: strOr(v.equipment, ''),
    target: strOr(v.target, ''),
    createdAt: strOr(v.createdAt, ''),
    // A bad photo is dropped, not the exercise: sessions may reference its id.
    image: isImageDataUrl(v.image) ? v.image : null,
  };
}

function toCheckin(v: unknown): BackupWeightCheckin | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.date) || !isNum(v.weightKg)) return null;
  const photos = Array.isArray(v.photos) ? v.photos.filter(isImageDataUrl) : [];
  return { id: v.id, date: v.date, weightKg: v.weightKg, photos };
}

/** Map then drop the nulls — `[]` when the collection itself is not an array. */
function validList<T>(v: unknown, toItem: (item: unknown, index: number) => T | null): T[] {
  return Array.isArray(v) ? v.map(toItem).filter((item): item is T => item !== null) : [];
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('invalid-json', 'That file is not valid JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new BackupError('not-a-backup', 'That file is not an ander-gym backup.');
  }

  const b = data as Partial<BackupFile>;
  if (typeof b.schemaVersion !== 'number') {
    throw new BackupError('not-a-backup', 'That file is not an ander-gym backup.');
  }
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError(
      'newer-schema',
      `This backup was made by a newer version of the app (schema ${b.schemaVersion}).`,
      { schema: b.schemaVersion },
    );
  }
  if (!Array.isArray(b.trainings) || !Array.isArray(b.sessions)) {
    throw new BackupError('missing-data', 'That backup is missing its trainings or sessions.');
  }

  return {
    schemaVersion: b.schemaVersion,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : null,
    trainings: validList(b.trainings, toTraining).map(withValidRest).map(withValidEmoji),
    sessions: validList(b.sessions, toSession),
    customExercises: validList(b.customExercises, toCustomExercise),
    settings: {
      weeklyGoal:
        typeof b.settings?.weeklyGoal === 'number' && b.settings.weeklyGoal > 0
          ? b.settings.weeklyGoal
          : 3,
      lastExportAt: typeof b.settings?.lastExportAt === 'string' ? b.settings.lastExportAt : null,
      favoriteExerciseIds: Array.isArray(b.settings?.favoriteExerciseIds)
        ? b.settings.favoriteExerciseIds.filter((id): id is string => typeof id === 'string')
        : [],
    },
    // Both absent entirely from a schema-1 backup (written before this
    // feature existed) — default rather than reject, same spirit as
    // `customExercises` defaulting to [] for a backup written before favorites.
    profile: {
      name: typeof b.profile?.name === 'string' ? b.profile.name : '',
      birthdate: typeof b.profile?.birthdate === 'string' ? b.profile.birthdate : null,
      heightCm: typeof b.profile?.heightCm === 'number' ? b.profile.heightCm : null,
      // Absent from a backup older than schema 4. Only an image data URL is
      // accepted: it becomes a Blob rendered as an <img>, so anything else in
      // a hand-edited file is dropped and the avatar falls back to initials.
      photo: isImageDataUrl(b.profile?.photo) ? b.profile.photo : null,
    },
    checkins: validList(b.checkins, toCheckin),
    // Absent entirely from a backup written before sport sessions existed —
    // same "default rather than reject" handling as `checkins`/`profile`.
    sportSessions: validList(b.sportSessions, toSportSession),
  };
}

/**
 * `replace` wipes first; `merge` unions by id with the incoming file winning.
 * The active session is intentionally not part of a backup — a half-finished
 * workout is not something you restore onto another device.
 *
 * Photos are decoded before the transaction opens: `dataUrlToBlob` is
 * synchronous CPU work, and an IndexedDB transaction auto-commits the moment
 * no request is pending, so anything slow has to happen outside it.
 */
export async function applyBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  const customExercises: CustomExercise[] = backup.customExercises.map(({ image, ...rest }) => ({
    ...rest,
    imageBlob: image ? dataUrlToBlob(image) : null,
  }));
  const checkins: WeightCheckin[] = backup.checkins.map(({ photos, ...rest }) => ({
    ...rest,
    photoBlobs: photos.map(dataUrlToBlob),
  }));

  const { photo, ...profileFields } = backup.profile;
  const profile: Profile = { ...profileFields, photoBlob: photo ? dataUrlToBlob(photo) : null };

  if (mode === 'replace') await clearAll();
  await writeAll({
    trainings: backup.trainings,
    sessions: backup.sessions,
    customExercises,
    settings: backup.settings,
    profile,
    checkins,
    sportSessions: backup.sportSessions,
  });
}
