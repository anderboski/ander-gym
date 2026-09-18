/**
 * The dictionaries are data, and TypeScript only checks their keys. These
 * tests check what the type system cannot: that the Spanish exercise
 * dictionary still covers the whole catalogue after either one changes, and
 * that a translated UI string keeps the placeholders its `t()` call fills in.
 */
import { describe, expect, it } from 'vitest';
import rawCatalogue from '../../../data/exercises.json';
import { en } from './en';
import { es } from './es';
import { EXERCISE_NAME_ES } from './exerciseNames';
import { FACET_DICTIONARIES } from './exerciseFacets';
import { FACET_KEYS, type RawExercise } from '../types';

const catalogue = rawCatalogue as RawExercise[];

describe('exercise catalogue dictionaries', () => {
  it('translate every exercise name in data/exercises.json', () => {
    const missing = [...new Set(catalogue.map((e) => e.name))].filter((name) => !(name in EXERCISE_NAME_ES));
    expect(missing).toEqual([]);
  });

  it('carry no entry for a name that is no longer in the catalogue', () => {
    const names = new Set(catalogue.map((e) => e.name));
    const stale = Object.keys(EXERCISE_NAME_ES).filter((name) => !names.has(name));
    expect(stale).toEqual([]);
  });

  it('translate every category, equipment and target value', () => {
    for (const key of FACET_KEYS) {
      const values = [...new Set(catalogue.map((e) => e[key]))];
      const missing = values.filter((v) => !(v in FACET_DICTIONARIES[key]));
      expect(missing, key).toEqual([]);
    }
  });

  it('never translate a value to an empty string', () => {
    for (const value of Object.values(EXERCISE_NAME_ES)) expect(value.trim()).not.toBe('');
  });
});

describe('UI dictionaries', () => {
  /** Distinct names: a language may repeat or drop a repeat of the same variable. */
  const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

  it('keep the same {placeholders} in Spanish as in English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('have no empty strings', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('');
    for (const [key, value] of Object.entries(es)) expect(value.trim(), key).not.toBe('');
  });
});
