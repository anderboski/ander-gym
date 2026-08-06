/**
 * Search + facet filtering over the exercise catalogue.
 *
 * Shared between the Exercises page (carousel) and the Trainings exercise
 * picker (list), so it owns the query/facet state and knows nothing about what
 * a result looks like — the caller supplies `renderItem`.
 *
 * The unfiltered catalogue is 1324 records, so results are windowed: an initial
 * slice is rendered and grown when a sentinel at the end of the strip/list
 * scrolls into view. That works for horizontal and vertical overflow alike.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { titleCase } from '../data/parse';
import { countActiveFacets, facetOptions, searchExercises, toggleFacet } from '../data/search';
import { useGym } from '../data/store';
import {
  EMPTY_FACETS,
  FACET_KEYS,
  FACET_LABELS,
  type Exercise,
  type Facets,
} from '../data/types';
import './ExerciseBrowser.css';

/** Results rendered up-front, and added on each sentinel hit. */
const PAGE_SIZE = 30;

export type ExerciseBrowserProps = {
  /** 'carousel' = horizontal snap strip; 'list' = vertical stack. */
  layout: 'carousel' | 'list';
  /** Renders one match. */
  renderItem: (exercise: Exercise) => ReactNode;
  /** Exercise ids to omit from results entirely. */
  excludeIds?: string[];
  /**
   * With no search query, list exercises logged at least once before the
   * rest of the alphabetical listing, instead of interleaved with it.
   */
  sortDoneFirst?: boolean;
};

export function ExerciseBrowser({
  layout,
  renderItem,
  excludeIds,
  sortDoneFirst,
}: ExerciseBrowserProps): ReactElement {
  const { exercises, exerciseLatest, exerciseRecords, settings } = useGym();

  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [onlyPR, setOnlyPR] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const favoriteIds = useMemo(
    () => new Set(settings.favoriteExerciseIds),
    [settings.favoriteExerciseIds],
  );

  const options = useMemo(() => facetOptions(exercises), [exercises]);

  // Callers usually pass a freshly-built array; key on the contents so the
  // memo below is not invalidated on every parent render.
  const excludeKey = excludeIds?.join(' ') ?? '';
  const excluded = useMemo(
    () => new Set(excludeKey ? excludeKey.split(' ') : []),
    [excludeKey],
  );

  const matches = useMemo(() => {
    const doneIds = sortDoneFirst ? new Set(exerciseLatest.keys()) : undefined;
    let found = searchExercises(exercises, query, facets, doneIds);
    if (excluded.size > 0) found = found.filter((ex) => !excluded.has(ex.id));
    if (onlyPR) found = found.filter((ex) => exerciseRecords.has(ex.id));
    if (onlyFavorites) found = found.filter((ex) => favoriteIds.has(ex.id));
    return found;
  }, [
    exercises,
    query,
    facets,
    excluded,
    sortDoneFirst,
    exerciseLatest,
    onlyPR,
    exerciseRecords,
    onlyFavorites,
    favoriteIds,
  ]);

  // Any change to the result set starts the window over.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, facets, excluded, onlyPR, onlyFavorites]);

  const visible = matches.slice(0, limit);
  const hasMore = limit < matches.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    // Re-created whenever the window grows: a fresh observer reports the
    // current state immediately, so a sentinel that is still on screen keeps
    // pulling more instead of stalling on an unchanged intersection.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((n) => n + PAGE_SIZE);
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, limit, matches]);

  const activeFacets = countActiveFacets(facets) + (onlyPR ? 1 : 0) + (onlyFavorites ? 1 : 0);

  return (
    <div className="browser">
      <div className="browser-search">
        <div className="browser-search-field">
          <label className="browser-sr-only" htmlFor="exercise-search">
            Search exercises
          </label>
          <input
            id="exercise-search"
            type="search"
            className="input input-search"
            placeholder="Search exercises"
            inputMode="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query !== '' && (
            <button
              type="button"
              className="browser-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="browser-facets">
        <div className="browser-facet">
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              aria-pressed={onlyPR}
              onClick={() => setOnlyPR((v) => !v)}
            >
              🏆 PR only
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((v) => !v)}
            >
              ⭐ Favorites
            </button>
          </div>
        </div>

        {FACET_KEYS.map((key) => (
          <div className="browser-facet" key={key}>
            <div className="section-title">{FACET_LABELS[key]}</div>
            <div className="chip-row">
              {options[key].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="chip"
                  aria-pressed={facets[key].includes(value)}
                  onClick={() => setFacets((f) => toggleFacet(f, key, value))}
                >
                  {titleCase(value)}
                </button>
              ))}
            </div>
          </div>
        ))}

        {activeFacets > 0 && (
          <div className="browser-facets-actions">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setFacets(EMPTY_FACETS);
                setOnlyPR(false);
                setOnlyFavorites(false);
              }}
            >
              Clear all ({activeFacets})
            </button>
          </div>
        )}
      </div>

      <div className="browser-count" role="status">
        {matches.length} {matches.length === 1 ? 'exercise' : 'exercises'}
      </div>

      {matches.length === 0 ? (
        <div className="empty">No exercises match those filters.</div>
      ) : (
        <div className={layout === 'carousel' ? 'browser-strip' : 'browser-list'}>
          {visible.map((ex) => renderItem(ex))}
          {hasMore && <div className="browser-sentinel" ref={sentinelRef} aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
