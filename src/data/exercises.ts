/** Loading and normalising the static exercise catalogue. */
import type { CustomExercise, Exercise, RawExercise } from './types';

const BASE = import.meta.env.BASE_URL;

export const CUSTOM_ID_PREFIX = 'c-';

/** `images/0001-x.jpg` (relative to data/) -> `/ander-gym/data/images/0001-x.jpg` */
function exerciseImageUrl(relativeToData: string): string {
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

/**
 * Downscale a picked photo so custom-exercise images stay small in IndexedDB
 * and in the JSON export. Longest edge is capped; output is JPEG.
 */
export async function downscaleImage(file: File, maxEdge = 640, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  return drawToJpeg(bitmap, 0, 0, bitmap.width, bitmap.height, w, h, quality);
}

/**
 * Centre-crop a picked photo to a square and downscale it — the profile
 * avatar is a circle, so cropping here means every render is a plain
 * `object-fit: cover` on an already-square image. 256 px covers the largest
 * avatar at 3× with room to spare while keeping the blob (and its base64 copy
 * in a backup) to a few tens of KB.
 */
export async function squareCropImage(file: File, edge = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  const out = Math.min(edge, side);
  return drawToJpeg(bitmap, sx, sy, side, side, out, out, quality);
}

/** Draws a source rect of `bitmap` onto a w×h canvas, releases the bitmap, encodes JPEG. */
async function drawToJpeg(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  w: number,
  h: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('canvas 2d unavailable');
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('image encoding failed');
  return blob;
}
