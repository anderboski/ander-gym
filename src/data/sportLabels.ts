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
    case 'running':
      return t('trainingKind.running');
    case 'climbing':
      return t('trainingKind.climbing');
    case 'other':
      return t('trainingKind.other');
  }
}

/** `m:ss /km`, or an em dash when there is no distance to divide by. Rounded to whole seconds first so 5:59.6 reads 6:00, not 5:60. */
export function formatPace(durationMin: number, distanceKm: number): string {
  if (distanceKm <= 0) return '—';
  return formatPaceValue(durationMin / distanceKm);
}

export function formatPaceValue(minPerKm: number): string {
  const total = Math.round(minPerKm * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
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
    case 'running': {
      const parts = [`${s.distanceKm.toFixed(1)} km`, formatPace(s.durationMin, s.distanceKm), `${Math.round(s.elevationM)} m`];
      if (s.avgBpm !== null) parts.push(`${Math.round(s.avgBpm)} bpm`);
      return parts.join(' · ');
    }
    case 'climbing': {
      const total = Object.values(s.climbsByGrade).reduce((sum, n) => sum + n, 0);
      return total === 1 ? t('sportLog.climbsSummaryOne') : t('sportLog.climbsSummaryOther', { count: total });
    }
    // The notes are the only thing an 'other' log records, so they double as
    // its summary line; without them the row would otherwise read blank.
    case 'other':
      return s.comments.trim().split('\n')[0]?.trim() || t('sportLog.otherSummary');
  }
}
