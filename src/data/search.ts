/** Fuzzy name search + facet filtering for the exercise list. */
import Fuse from 'fuse.js';
import type { Language } from './i18n';
import { translateExerciseName } from './exerciseI18n';
import { FACET_KEYS, type Exercise, type FacetKey, type Facets } from './types';

/** Distinct values per facet, alphabetically sorted, for rendering the chip rows. */
export function facetOptions(exercises: Exercise[]): Record<FacetKey, string[]> {
  const sets: Record<FacetKey, Set<string>> = {
    category: new Set(),
    equipment: new Set(),
    target: new Set(),
  };
  for (const ex of exercises) {
    for (const key of FACET_KEYS) {
      const v = ex[key];
      if (v) sets[key].add(v);
    }
  }
  return {
    category: [...sets.category].sort(),
    equipment: [...sets.equipment].sort(),
    target: [...sets.target].sort(),
  };
}

/** Multi-select within a facet is OR; across facets it is AND. */
export function matchesFacets(ex: Exercise, facets: Facets): boolean {
  return FACET_KEYS.every((key) => {
    const selected = facets[key];
    return selected.length === 0 || selected.includes(ex[key]);
  });
}

export function countActiveFacets(facets: Facets): number {
  return FACET_KEYS.reduce((n, k) => n + facets[k].length, 0);
}

/** Toggle one value in one facet, returning a new Facets object. */
export function toggleFacet(facets: Facets, key: FacetKey, value: string): Facets {
  const current = facets[key];
  return {
    ...facets,
    [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
  };
}

/* -------------------------------------------------------------------------- */

// Indexing 1324 names takes a few ms, so the index is cached and only rebuilt
// when the exercise list itself changes (i.e. a custom exercise was added) or
// the app language flips (the Spanish index adds a translated-name key).
let cache: { list: Exercise[]; language: Language; fuse: Fuse<Exercise> } | null = null;

function fuseFor(list: Exercise[], language: Language): Fuse<Exercise> {
  if (cache && cache.list === list && cache.language === language) return cache.fuse;
  const fuse = new Fuse(list, {
    keys:
      language === 'es'
        ? ['name', { name: 'nameEs', getFn: (ex) => translateExerciseName('es', ex.name) }]
        : ['name'],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  cache = { list, language, fuse };
  return fuse;
}

/**
 * Search + filter.
 *
 * The fuzzy pass runs over the whole list and facets are applied to its output.
 * That yields the same set as filtering first (the two constraints are ANDed)
 * while keeping one cached Fuse index instead of rebuilding on every chip tap.
 *
 * Ordering: relevance when there is a query, alphabetical otherwise. When
 * `doneIds` is given, exercises in that set sort before the rest of the
 * alphabetical listing rather than being interleaved with it — the query
 * case is left alone, since typed relevance matters more there than history.
 */
export function searchExercises(
  exercises: Exercise[],
  query: string,
  facets: Facets,
  doneIds?: ReadonlySet<string>,
  language: Language = 'en',
): Exercise[] {
  const q = query.trim();

  if (q.length < 2) {
    // The display name is resolved once per exercise, not once per comparison:
    // a 1324-record sort makes ~25k comparisons, each of which would otherwise
    // do two dictionary lookups and build two locale comparators.
    const collator = new Intl.Collator(language);
    return exercises
      .filter((ex) => matchesFacets(ex, facets))
      .map((ex) => ({ ex, done: doneIds?.has(ex.id) ? 0 : 1, key: translateExerciseName(language, ex.name) }))
      .sort((a, b) => a.done - b.done || collator.compare(a.key, b.key))
      .map((r) => r.ex);
  }

  return fuseFor(exercises, language)
    .search(q)
    .map((r) => r.item)
    .filter((ex) => matchesFacets(ex, facets));
}
