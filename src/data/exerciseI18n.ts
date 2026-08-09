/**
 * Display-only Spanish translation for exercise data (SPEC §5.1).
 *
 * `Exercise.name/category/equipment/target` stay canonical English always —
 * they are the values matched against for search, facet filtering, and what
 * a custom exercise persists to IndexedDB. Translating them in place would
 * make a custom exercise's category permanently language-locked to whatever
 * the UI happened to be set to when it was created, and would split the
 * facet chips into English and Spanish variants of the same underlying
 * value. These functions only ever affect what is rendered to the user.
 */
import { EXERCISE_NAME_ES } from './translations/exerciseNames';
import { FACET_DICTIONARIES } from './translations/exerciseFacets';
import type { FacetKey } from './types';
import type { Language } from './i18n';

/** Untranslated names (custom exercises, or a gap in the dictionary) fall back to English. */
export function translateExerciseName(language: Language, name: string): string {
  if (language !== 'es') return name;
  return EXERCISE_NAME_ES[name] ?? name;
}

/** Untranslated facet values (a custom exercise's own category/equipment/target) fall back to English. */
export function translateFacetValue(language: Language, key: FacetKey, value: string): string {
  if (language !== 'es') return value;
  return FACET_DICTIONARIES[key][value] ?? value;
}
