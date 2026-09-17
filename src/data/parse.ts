/** Parsing and text helpers with no I/O — all unit-tested. */
import { REST_MAX_SECONDS, REST_MIN_SECONDS } from './types';
import type { SetEntry } from './types';

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

/**
 * `10x25kg · 10x25kg · 8x25kg` — a past session's sets on one line, for the
 * "last time" hint on a session row (SPEC §5.4).
 *
 * Capped rather than wrapped: that hint shares the row's name column with the
 * exercise name, and a six-set history that pushes every row two lines taller
 * costs more than the sets it shows. The kept sets are the first ones logged,
 * in the order they were performed — the same order the row's own set column
 * reads in, and the ones you are about to repeat starting from set 1.
 */
export function summariseSets(sets: SetEntry[], max: number): { text: string; more: number } {
  const shown = sets.slice(0, max);
  return {
    text: shown.map((s) => formatSet(s.reps, s.weight)).join(' · '),
    more: sets.length - shown.length,
  };
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

/**
 * First grapheme cluster of a string — one visual unit even for multi-codepoint
 * emoji (skin-tone modifiers, ZWJ family sequences), so a training icon never
 * gets truncated mid-sequence.
 */
export function firstGrapheme(input: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(input)[
      Symbol.iterator
    ]();
    const first = it.next();
    return first.done ? '' : first.value.segment;
  }
  return Array.from(input)[0] ?? '';
}
