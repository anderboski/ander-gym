import { describe, expect, it } from 'vitest';
import { translateExerciseName, translateFacetValue } from './exerciseI18n';

describe('translateExerciseName', () => {
  it('returns the English name unchanged in English', () => {
    expect(translateExerciseName('en', 'barbell bench press')).toBe('barbell bench press');
  });

  it('returns the dictionary translation in Spanish', () => {
    expect(translateExerciseName('es', 'barbell bench press')).toBe('press de banca con barra');
  });

  it('falls back to the English name for a custom exercise with no dictionary entry', () => {
    expect(translateExerciseName('es', 'my special press')).toBe('my special press');
  });
});

describe('translateFacetValue', () => {
  it('returns the English value unchanged in English', () => {
    expect(translateFacetValue('en', 'equipment', 'barbell')).toBe('barbell');
  });

  it('translates category, equipment and target in Spanish', () => {
    expect(translateFacetValue('es', 'category', 'chest')).toBe('pecho');
    expect(translateFacetValue('es', 'equipment', 'barbell')).toBe('barra');
    expect(translateFacetValue('es', 'target', 'pectorals')).toBe('pectorales');
  });

  it('falls back to the English value for a custom exercise category with no dictionary entry', () => {
    expect(translateFacetValue('es', 'equipment', 'other')).toBe('other');
  });
});
