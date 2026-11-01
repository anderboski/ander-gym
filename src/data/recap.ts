/**
 * Which weekly recap (SPEC §5.1) this device has already shown. Same
 * reasoning as the changelog's last-seen version: a device-local "seen"
 * marker, not app data, so it lives in localStorage rather than the
 * `settings` store and is deliberately not part of a backup — restoring a
 * file on a new phone shouldn't suppress that phone's recap.
 */
export const LAST_RECAP_WEEK_KEY = 'ander-gym-last-recap-week';

/** `dayKey` of the Monday of the last recapped week, or null if none has been shown. */
export function getLastRecapWeek(): string | null {
  try {
    return localStorage.getItem(LAST_RECAP_WEEK_KEY);
  } catch {
    return null;
  }
}

export function setLastRecapWeek(weekKey: string): void {
  try {
    localStorage.setItem(LAST_RECAP_WEEK_KEY, weekKey);
  } catch {
    // Storage blocked: the recap simply shows again next launch — harmless.
  }
}
