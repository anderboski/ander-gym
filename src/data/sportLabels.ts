/**
 * Presentation helpers for sport sessions. These need `t()`, so they can't
 * live in derive.ts (pure, UI-agnostic) or types.ts (no i18n) — same reason
 * `daysAgoLabel` lives in i18n.tsx rather than derive.ts.
 */
import type { TFunc } from './i18n';
import type { SnowCondition, SportSession, TrainingKind, WeatherCondition } from './types';

export function trainingKindLabel(t: TFunc, kind: TrainingKind): string {
  switch (kind) {
    case 'gym':
      return t('trainingKind.gym');
    case 'snowboard':
      return t('trainingKind.snowboard');
    case 'cycling':
      return t('trainingKind.cycling');
    case 'climbing':
      return t('trainingKind.climbing');
  }
}

export function weatherLabel(t: TFunc, weather: WeatherCondition): string {
  return t(`weather.${weather}`);
}

export function snowConditionLabel(t: TFunc, snow: SnowCondition): string {
  return t(`snow.${snow}`);
}

/** One line per kind, used everywhere a sport session is shown as a row (History, Trainings' past-logs list). */
export function sportSessionSummary(t: TFunc, s: SportSession): string {
  switch (s.kind) {
    case 'snowboard':
      return `${weatherLabel(t, s.weather)} · ${snowConditionLabel(t, s.snowCondition)}`;
    case 'cycling': {
      const parts = [`${s.distanceKm.toFixed(1)} km`, `${Math.round(s.elevationM)} m`];
      if (s.avgBpm !== null) parts.push(`${Math.round(s.avgBpm)} bpm`);
      return parts.join(' · ');
    }
    case 'climbing': {
      const total = Object.values(s.climbsByGrade).reduce((sum, n) => sum + n, 0);
      return total === 1 ? t('sportLog.climbsSummaryOne') : t('sportLog.climbsSummaryOther', { count: total });
    }
  }
}
