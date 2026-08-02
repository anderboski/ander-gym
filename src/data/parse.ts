/** Parsing and text helpers with no I/O — all unit-tested. */

/** `Shoulder-bicep-tricep` -> `shoulder-bicep-tricep` */
export function slugify(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Split a training-day label into its body parts.
 * Handles the double hyphen in lines like `Pecs-back-` or `Legs--abs`.
 */
export function bodyParts(label: string): string[] {
  return label
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
}

/** `Shoulder-bicep-tricep` -> `Shoulder · Bicep · Tricep` */
export function bodyPartsLabel(label: string): string {
  return bodyParts(label).join(' · ');
}

/**
 * Parse data/training_days.txt. Line order is the rotation order.
 * Blank lines are dropped; duplicate slugs keep their first occurrence.
 */
export function parseTrainingDays(text: string): { id: string; label: string; order: number }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; order: number }[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const label = raw.trim();
    if (!label) continue;
    const id = slugify(label);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, order: out.length });
  }
  return out;
}

/** `10 x 25 kg`, or `10 reps` when the weight is zero (bodyweight). */
export function formatSet(reps: number, weight: number): string {
  return weight > 0 ? `${reps}x${formatWeight(weight)}kg` : `${reps} reps`;
}

/** Trims trailing zeros: 25 -> "25", 22.5 -> "22.5". */
export function formatWeight(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

/** Title-case a facet value for display: `body weight` -> `Body weight`. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
