/** Parsing and text helpers with no I/O — all unit-tested. */

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
