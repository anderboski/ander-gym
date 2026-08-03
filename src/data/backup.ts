/**
 * Manual JSON backup. This is the only defence against device loss and against
 * Safari evicting IndexedDB, so the format is deliberately plain and complete.
 */
import {
  SCHEMA_VERSION,
  clearAll,
  getDB,
  putCustomExercise,
  putSession,
  putSetting,
  putTraining,
  readAll,
} from './db';
import { parseRestSeconds } from './parse';
import type { CustomExercise, Session, Settings, Training } from './types';

/** A custom exercise with its photo inlined, so a backup is a single file. */
export type BackupCustomExercise = Omit<CustomExercise, 'imageBlob'> & {
  /** `data:image/jpeg;base64,...` or null. */
  image: string | null;
};

export type BackupFile = {
  schemaVersion: number;
  exportedAt: string;
  trainings: Training[];
  sessions: Session[];
  customExercises: BackupCustomExercise[];
  settings: Settings;
};

export type ImportMode = 'merge' | 'replace';

/* -------------------------------------------------------------------------- */
/* base64 <-> Blob (works in both the browser and Node test env)                */
/* -------------------------------------------------------------------------- */

export async function blobToDataUrl(blob: Blob): Promise<string> {
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
  const { trainings, sessions, customExercises, settings } = await readAll();

  const withImages: BackupCustomExercise[] = await Promise.all(
    customExercises.map(async ({ imageBlob, ...rest }) => ({
      ...rest,
      image: imageBlob ? await blobToDataUrl(imageBlob) : null,
    })),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    trainings,
    sessions,
    customExercises: withImages,
    settings,
  };
}

export function backupFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ander-gym-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Trigger a file download. Uses an object URL + synthetic click, which is what
 * iOS Safari supports — there is no File System Access API on iOS.
 */
export function downloadBackup(backup: BackupFile, filename = backupFilename()): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
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

export class BackupError extends Error {}

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

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new BackupError('That file is not an ander-gym backup.');
  }

  const b = data as Partial<BackupFile>;
  if (typeof b.schemaVersion !== 'number') {
    throw new BackupError('That file is not an ander-gym backup.');
  }
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of the app (schema ${b.schemaVersion}).`,
    );
  }
  if (!Array.isArray(b.trainings) || !Array.isArray(b.sessions)) {
    throw new BackupError('That backup is missing its trainings or sessions.');
  }

  return {
    schemaVersion: b.schemaVersion,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    trainings: b.trainings.map(withValidRest),
    sessions: b.sessions,
    customExercises: Array.isArray(b.customExercises) ? b.customExercises : [],
    settings: {
      weeklyGoal:
        typeof b.settings?.weeklyGoal === 'number' && b.settings.weeklyGoal > 0
          ? b.settings.weeklyGoal
          : 3,
      lastExportAt: typeof b.settings?.lastExportAt === 'string' ? b.settings.lastExportAt : null,
    },
  };
}

/**
 * `replace` wipes first; `merge` unions by id with the incoming file winning.
 * The active session is intentionally not part of a backup — a half-finished
 * workout is not something you restore onto another device.
 */
export async function applyBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  if (mode === 'replace') await clearAll();

  await getDB(); // ensure the schema exists before the writes below

  for (const t of backup.trainings) await putTraining(t);
  for (const s of backup.sessions) await putSession(s as Session);

  for (const c of backup.customExercises) {
    const { image, ...rest } = c;
    await putCustomExercise({ ...rest, imageBlob: image ? dataUrlToBlob(image) : null });
  }

  await putSetting('weeklyGoal', backup.settings.weeklyGoal);
  await putSetting('lastExportAt', backup.settings.lastExportAt);
}
