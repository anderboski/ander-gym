/** Parsing and text helpers with no I/O — all unit-tested. */
import { REST_MAX_SECONDS, REST_MIN_SECONDS } from './types';

/**
 * A rest duration from an untrusted source — an imported backup file, or a
 * control that could be given a bad value. Returns null for anything that could
 * not run a countdown: `Date.now() + NaN` produces a deadline that never
 * arrives and a timer stuck at "0:00".
 *
 * A usable but silly number is clamped rather than rejected — 5 s was meant as
 * a rest, 0 or -3 was not.
 */
export function parseRestSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = Math.round(value);
  if (whole <= 0) return null;
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, whole));
}

/** `10 x 25 kg`, or `10 reps` when the weight is zero (bodyweight). */
export function formatSet(reps: number, weight: number): string {
  return weight > 0 ? `${reps}x${formatWeight(weight)}kg` : `${reps} reps`;
}

/** Trims trailing zeros: 25 -> "25", 22.5 -> "22.5". */
export function formatWeight(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

/**
 * `840` / `4.2k` / `12k` — a weekly volume in kg is a five-digit number, and a
 * chart axis on a phone has room for about four characters.
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.round(value));
  const thousands = value / 1000;
  return `${Math.abs(thousands) < 10 ? Math.round(thousands * 10) / 10 : Math.round(thousands)}k`;
}

/** Title-case a facet value for display: `body weight` -> `Body weight`. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
