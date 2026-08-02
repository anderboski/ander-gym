/** Loading and normalising the static exercise catalogue. */
import type { CustomExercise, Exercise, RawExercise } from './types';

const BASE = import.meta.env.BASE_URL;

export const CUSTOM_ID_PREFIX = 'c-';

/** `images/0001-x.jpg` (relative to data/) -> `/ander-gym/data/images/0001-x.jpg` */
export function exerciseImageUrl(relativeToData: string): string {
  return `${BASE}data/${relativeToData.replace(/^\/+/, '')}`;
}

export function normaliseExercise(raw: RawExercise): Exercise {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    equipment: raw.equipment,
    target: raw.target,
    secondaryMuscles: raw.secondary_muscles ?? [],
    imageUrl: exerciseImageUrl(raw.image),
    isCustom: false,
  };
}

/**
 * Custom exercises carry a Blob. The object URL lives for the lifetime of the
 * app instance; it is revoked when the exercise list is rebuilt.
 */
export function customToExercise(c: CustomExercise): Exercise {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    equipment: c.equipment,
    target: c.target,
    secondaryMuscles: [],
    imageUrl: c.imageBlob ? URL.createObjectURL(c.imageBlob) : null,
    isCustom: true,
  };
}

export function revokeCustomUrls(exercises: Exercise[]): void {
  for (const ex of exercises) {
    if (ex.isCustom && ex.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(ex.imageUrl);
  }
}

export async function fetchRawExercises(): Promise<RawExercise[]> {
  const res = await fetch(`${BASE}data/exercises.json`);
  if (!res.ok) throw new Error(`exercises.json: ${res.status}`);
  return (await res.json()) as RawExercise[];
}

export async function fetchTrainingDaysText(): Promise<string> {
  const res = await fetch(`${BASE}data/training_days.txt`);
  if (!res.ok) throw new Error(`training_days.txt: ${res.status}`);
  return await res.text();
}

/**
 * Downscale a picked photo so custom-exercise images stay small in IndexedDB
 * and in the JSON export. Longest edge is capped; output is JPEG.
 */
export async function downscaleImage(file: File, maxEdge = 640, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('image encoding failed');
  return blob;
}
