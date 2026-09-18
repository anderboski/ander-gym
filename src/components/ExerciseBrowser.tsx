/**
 * Search + facet filtering over the exercise catalogue.
 *
 * Shared between the Exercises page (carousel) and the two pickers (list), so
 * it owns the query/facet state and knows nothing about what a result looks
 * like — the caller supplies `renderItem`.
 *
 * The unfiltered catalogue is 1324 records, so results are windowed: an initial
 * slice is rendered and grown when a sentinel at the end of the strip/list
 * scrolls into view. That works for horizontal and vertical overflow alike.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { titleCase } from '../data/parse';
import { translateFacetValue } from '../data/exerciseI18n';
import { countActiveFacets, facetOptions, searchExercises, toggleFacet } from '../data/search';
import { useGym } from '../data/store';
import { FACET_LABEL_KEYS, useLanguage } from '../data/i18n';
import { EMPTY_FACETS, FACET_KEYS, type Exercise, type Facets } from '../data/types';
import { StarIcon, TrophyIcon } from './icons';
import './ExerciseBrowser.css';

/** Results rendered up-front, and added on each sentinel hit. */
const PAGE_SIZE = 30;

type ExerciseBrowserProps = {
  /** 'carousel' = horizontal snap strip; 'list' = vertical stack. */
  layout: 'carousel' | 'list';
  /**
   * Renders one match. `disabled` is true for an exercise the caller already
   * holds (see `disabledIds`); the row is expected to render it as unpickable
   * rather than the caller filtering it out.
   */
  renderItem: (exercise: Exercise, state: { disabled: boolean }) => ReactNode;
  /**
   * Exercises the caller already holds. They stay in the results — and in the
   * match count — and are handed to `renderItem` as disabled instead. Dropping
   * them would make the same query return a different set here than on the
   * Exercises page, which reads as a broken filter rather than as "you already
   * have this one" (SPEC §5.3, §5.4).
   */
  disabledIds?: string[];
  /**
   * With no search query, list exercises logged at least once before the
   * rest of the alphabetical listing, instead of interleaved with it.
   */
  sortDoneFirst?: boolean;
};

export function ExerciseBrowser({ layout, renderItem, disabledIds, sortDoneFirst }: ExerciseBrowserProps): ReactElement {
  const { exercises, exerciseLatest, exerciseRecords, settings } = useGym();
  const { t, language } = useLanguage();

  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [onlyPR, setOnlyPR] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const favoriteIds = useMemo(() => new Set(settings.favoriteExerciseIds), [settings.favoriteExerciseIds]);

  const options = useMemo(() => facetOptions(exercises), [exercises]);

  // Callers usually pass a freshly-built array; key on the contents so the
  // memo below is not invalidated on every parent render.
  const disabledKey = disabledIds?.join(' ') ?? '';
  const disabled = useMemo(() => new Set(disabledKey ? disabledKey.split(' ') : []), [disabledKey]);

  const matches = useMemo(() => {
    const doneIds = sortDoneFirst ? new Set(exerciseLatest.keys()) : undefined;
    let found = searchExercises(exercises, query, facets, doneIds, language);
    if (onlyPR) found = found.filter((ex) => exerciseRecords.has(ex.id));
    if (onlyFavorites) found = found.filter((ex) => favoriteIds.has(ex.id));
    return found;
  }, [exercises, query, facets, sortDoneFirst, language, exerciseLatest, onlyPR, exerciseRecords, onlyFavorites, favoriteIds]);

  // Any change to the result set starts the window over.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, facets, onlyPR, onlyFavorites]);

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
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE_SIZE);
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
            {t('browser.searchLabel')}
          </label>
          <input
            id="exercise-search"
            type="search"
            className="input input-search"
            placeholder={t('browser.searchLabel')}
            inputMode="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query !== '' && (
            <button type="button" className="browser-search-clear" aria-label={t('browser.clearSearch')} onClick={() => setQuery('')}>
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="browser-facets">
        <div className="chip-row">
          <button type="button" className="chip" aria-pressed={onlyPR} onClick={() => setOnlyPR((v) => !v)}>
            <TrophyIcon />
            {t('browser.prOnly')}
          </button>
          <button type="button" className="chip" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
            <StarIcon filled={onlyFavorites} />
            {t('browser.favorites')}
          </button>
        </div>

        {FACET_KEYS.map((key) => (
          <div className="browser-facet" key={key}>
            <div className="browser-facet-title">{t(FACET_LABEL_KEYS[key])}</div>
            <div className="chip-row">
              {options[key].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="chip"
                  aria-pressed={facets[key].includes(value)}
                  onClick={() => setFacets((f) => toggleFacet(f, key, value))}
                >
                  {titleCase(translateFacetValue(language, key, value))}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="browser-count">
        <span role="status">
          {matches.length} {t(matches.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </span>
        {activeFacets > 0 && (
          <button
            type="button"
            className="browser-clear"
            onClick={() => {
              setFacets(EMPTY_FACETS);
              setOnlyPR(false);
              setOnlyFavorites(false);
            }}
          >
            {t('browser.clearAll', { count: activeFacets })}
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="empty">{t('browser.noMatches')}</div>
      ) : (
        <div className={layout === 'carousel' ? 'browser-strip' : 'browser-list'}>
          {visible.map((ex) => renderItem(ex, { disabled: disabled.has(ex.id) }))}
          {hasMore && <div className="browser-sentinel" ref={sentinelRef} aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
