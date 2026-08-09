import { describe, expect, it } from 'vitest';
import { countActiveFacets, facetOptions, matchesFacets, searchExercises, toggleFacet } from './search';
import { EMPTY_FACETS, type Exercise, type Facets } from './types';

function ex(id: string, name: string, category: string, equipment: string, target: string): Exercise {
  return {
    id,
    name,
    category,
    equipment,
    target,
    secondaryMuscles: [],
    imageUrl: `images/${id}.jpg`,
    isCustom: false,
  };
}

const catalogue: Exercise[] = [
  ex('1', 'barbell bench press', 'chest', 'barbell', 'pectorals'),
  ex('2', 'dumbbell bench press', 'chest', 'dumbbell', 'pectorals'),
  ex('3', 'barbell curl', 'upper arms', 'barbell', 'biceps'),
  ex('4', '3/4 sit-up', 'waist', 'body weight', 'abs'),
  ex('5', 'cable crossover', 'chest', 'cable', 'pectorals'),
];

const facets = (partial: Partial<Facets>): Facets => ({ ...EMPTY_FACETS, ...partial });

describe('facetOptions', () => {
  it('returns sorted distinct values per facet', () => {
    const options = facetOptions(catalogue);
    expect(options.category).toEqual(['chest', 'upper arms', 'waist']);
    expect(options.equipment).toEqual(['barbell', 'body weight', 'cable', 'dumbbell']);
    expect(options.target).toEqual(['abs', 'biceps', 'pectorals']);
  });
});

describe('matchesFacets', () => {
  it('treats an empty facet as no constraint', () => {
    expect(matchesFacets(catalogue[0]!, EMPTY_FACETS)).toBe(true);
  });

  it('ORs values within one facet', () => {
    const f = facets({ equipment: ['barbell', 'cable'] });
    expect(catalogue.filter((e) => matchesFacets(e, f)).map((e) => e.id)).toEqual(['1', '3', '5']);
  });

  it('ANDs across facets', () => {
    const f = facets({ category: ['chest'], equipment: ['barbell', 'cable'] });
    expect(catalogue.filter((e) => matchesFacets(e, f)).map((e) => e.id)).toEqual(['1', '5']);
  });

  it('can produce an empty set', () => {
    const f = facets({ category: ['waist'], equipment: ['barbell'] });
    expect(catalogue.filter((e) => matchesFacets(e, f))).toEqual([]);
  });
});

describe('toggleFacet / countActiveFacets', () => {
  it('adds then removes a value', () => {
    const once = toggleFacet(EMPTY_FACETS, 'equipment', 'cable');
    expect(once.equipment).toEqual(['cable']);
    expect(toggleFacet(once, 'equipment', 'cable').equipment).toEqual([]);
  });

  it('does not mutate the input', () => {
    const before = EMPTY_FACETS;
    toggleFacet(before, 'category', 'chest');
    expect(before.category).toEqual([]);
  });

  it('counts every selected chip', () => {
    const f = facets({ category: ['chest'], equipment: ['barbell', 'cable'] });
    expect(countActiveFacets(f)).toBe(3);
  });
});

describe('searchExercises', () => {
  it('lists everything alphabetically with no query or facets', () => {
    expect(searchExercises(catalogue, '', EMPTY_FACETS).map((e) => e.name)).toEqual([
      '3/4 sit-up',
      'barbell bench press',
      'barbell curl',
      'cable crossover',
      'dumbbell bench press',
    ]);
  });

  it('treats a one-character query as no query', () => {
    expect(searchExercises(catalogue, 'b', EMPTY_FACETS)).toHaveLength(5);
  });

  it('matches on an exact substring', () => {
    const names = searchExercises(catalogue, 'bench', EMPTY_FACETS).map((e) => e.name);
    expect(names).toEqual(['barbell bench press', 'dumbbell bench press']);
  });

  it('matches fuzzily through a typo', () => {
    const names = searchExercises(catalogue, 'benhc press', EMPTY_FACETS).map((e) => e.name);
    expect(names).toContain('barbell bench press');
  });

  it('ANDs the query with the facets', () => {
    const f = facets({ equipment: ['dumbbell'] });
    expect(searchExercises(catalogue, 'bench', f).map((e) => e.id)).toEqual(['2']);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchExercises(catalogue, 'zzzzzz', EMPTY_FACETS)).toEqual([]);
  });

  it('finds custom exercises added to the list', () => {
    const withCustom = [...catalogue, { ...ex('c-1', 'my special press', 'chest', 'other', 'pectorals'), isCustom: true }];
    expect(searchExercises(withCustom, 'special', EMPTY_FACETS).map((e) => e.id)).toEqual(['c-1']);
  });

  it('with doneIds, lists done exercises first, alphabetical within each group', () => {
    const doneIds = new Set(['5', '3']);
    expect(searchExercises(catalogue, '', EMPTY_FACETS, doneIds).map((e) => e.id)).toEqual([
      '3', // barbell curl
      '5', // cable crossover
      '4', // 3/4 sit-up
      '1', // barbell bench press
      '2', // dumbbell bench press
    ]);
  });

  it('ignores doneIds once a query is typed', () => {
    const doneIds = new Set(['5']);
    const names = searchExercises(catalogue, 'bench', EMPTY_FACETS, doneIds).map((e) => e.name);
    expect(names).toEqual(['barbell bench press', 'dumbbell bench press']);
  });

  it('an empty doneIds set behaves like no set at all', () => {
    expect(searchExercises(catalogue, '', EMPTY_FACETS, new Set()).map((e) => e.id)).toEqual(
      searchExercises(catalogue, '', EMPTY_FACETS).map((e) => e.id),
    );
  });

  it('sorts alphabetically by the Spanish name when the language is es', () => {
    // '3/4 sit-up' -> 'abdominal 3/4', 'barbell curl' -> 'curl con barra',
    // 'barbell/dumbbell bench press' -> 'press de banca con barra/mancuerna',
    // 'cable crossover' has no dictionary entry and falls back to English.
    expect(searchExercises(catalogue, '', EMPTY_FACETS, undefined, 'es').map((e) => e.id)).toEqual([
      '4',
      '5',
      '3',
      '1',
      '2',
    ]);
  });

  it('matches a Spanish query against the translated name when the language is es', () => {
    // 'dumbbell bench press' -> 'press de banca con mancuerna'; 'mancuerna' has
    // no fuzzy overlap with any English name, so this only matches via nameEs.
    const ids = searchExercises(catalogue, 'mancuerna', EMPTY_FACETS, undefined, 'es').map((e) => e.id);
    expect(ids).toEqual(['2']);
  });

  it('does not match a Spanish query in English mode', () => {
    expect(searchExercises(catalogue, 'mancuerna', EMPTY_FACETS)).toEqual([]);
  });
});
