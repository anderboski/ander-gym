import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import { exerciseProgress, historyFor, type ExerciseRecord, type ProgressMetric } from '../data/derive';
import { formatKg, formatKgDelta, formatSet, formatWeight, titleCase } from '../data/parse';
import { daysAgoLabel, formatDay, formatDayTime, useLanguage } from '../data/i18n';
import { exerciseDisplayName, translateFacetValue } from '../data/exerciseI18n';
import type { Exercise, SetEntry } from '../data/types';
import { ChartFigure, LineChart } from './Chart';
import { ExerciseThumb } from './ExerciseThumb';
import { Sheet } from './Sheet';
import { StarIcon, TrashIcon, TrophyIcon } from './icons';
import './ExerciseCard.css';

/** Two-column reps/weight table — the "training matrix" from the spec. */
export function SetMatrix({ sets }: { sets: SetEntry[] }) {
  const { t } = useLanguage();

  return (
    <table className="set-matrix">
      <thead>
        <tr>
          <th scope="col">{t('exerciseCard.reps')}</th>
          <th scope="col">{t('exerciseCard.weight')}</th>
        </tr>
      </thead>
      <tbody>
        {sets.map((set, i) => (
          <tr key={i}>
            <td>{set.reps}</td>
            <td>{set.weight > 0 ? `${formatWeight(set.weight)} kg` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress chart (SPEC §5.2)                                                  */
/* -------------------------------------------------------------------------- */

/** Toggle order. Top set first: it is the number the user actually lifted. */
const METRIC_ORDER: ProgressMetric[] = ['topWeight', 'e1rm'];

/**
 * Trend of one exercise over its own history.
 *
 * Three shapes rather than one, because a chart of nothing is worse than no
 * chart: nothing plottable at all, a single reading (a figure, not a line —
 * one point is not a trend), and an actual line from two sessions up.
 */
function ExerciseProgress({ history }: { history: ExerciseRecord[] }) {
  const { t, locale } = useLanguage();
  const [metric, setMetric] = useState<ProgressMetric>('topWeight');
  const points = useMemo(() => exerciseProgress(history, metric), [history, metric]);

  const metrics: Record<ProgressMetric, { label: string; title: string }> = {
    topWeight: { label: t('exerciseCard.topSet'), title: t('exerciseCard.topSetWeightTitle') },
    e1rm: { label: t('exerciseCard.estOneRM'), title: t('exerciseCard.estimatedOneRMTitle') },
  };

  const active = metrics[metric];
  const toggle = (
    <div className="segment" role="group" aria-label={t('exerciseCard.chartMetricAria')}>
      {METRIC_ORDER.map((id) => (
        <button key={id} className="segment-btn" aria-pressed={id === metric} onClick={() => setMetric(id)}>
          {metrics[id].label}
        </button>
      ))}
    </div>
  );

  const first = points[0];
  const last = points[points.length - 1];

  // Logged, but never with weight: Epley and a weight axis both need a load.
  if (!first || !last) {
    return <div className="ex-progress ex-progress-none">{t('exerciseCard.bodyweightOnly')}</div>;
  }

  const delta = last.value - first.value;
  const trend =
    delta > 0
      ? t('exerciseCard.trendUp', { kg: formatKg(delta) })
      : delta < 0
        ? t('exerciseCard.trendDown', { kg: formatKg(-delta) })
        : t('exerciseCard.trendNoChange');

  if (points.length === 1) {
    return (
      <div className="ex-progress">
        <ChartFigure
          title={active.title}
          value={formatKg(last.value)}
          action={toggle}
          caption={t('exerciseCard.oneSessionCaption', { date: formatDay(locale, last.at) })}
        >
          <div className="ex-progress-single num">{formatSet(last.set.reps, last.set.weight)}</div>
        </ChartFigure>
      </div>
    );
  }

  return (
    <div className="ex-progress">
      <ChartFigure
        title={active.title}
        value={formatKg(last.value)}
        action={toggle}
        caption={
          <>
            {points.length} {t('common.sessionsOther')} · {formatDay(locale, first.at)} → {formatDay(locale, last.at)} ·{' '}
            <span className="num">{formatKgDelta(delta)}</span>
          </>
        }
      >
        <LineChart
          values={points.map((p) => p.value)}
          formatTick={(v) => formatWeight(Math.round(v * 10) / 10)}
          xLabels={[formatDay(locale, first.at), formatDay(locale, last.at)]}
          ariaLabel={t('exerciseCard.multiSessionAria', {
            title: active.title,
            count: points.length,
            firstKg: formatKg(first.value),
            firstDate: formatDay(locale, first.at),
            lastKg: formatKg(last.value),
            lastDate: formatDay(locale, last.at),
            trend,
          })}
        />
      </ChartFigure>
    </div>
  );
}

/** Full training history for one exercise, newest first. */
export function ExerciseHistorySheet({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { sessions } = useGym();
  const { t, language, locale } = useLanguage();
  const records = useMemo(() => historyFor(exercise.id, sessions), [exercise.id, sessions]);
  const displayName = exerciseDisplayName(language, exercise.name);

  return (
    <Sheet title={displayName} onClose={onClose} full>
      <div className="ex-history">
        <ExerciseThumb exercise={exercise} name={displayName} className="ex-history-media" />
        {records.length === 0 ? (
          <div className="empty">{t('exerciseCard.noHistorySheet')}</div>
        ) : (
          <>
            <ExerciseProgress history={records} />
            {records.map(({ session, sets, daysAgo }) => (
              <div className="ex-history-entry" key={session.id}>
                <div className="ex-history-head">
                  <span className="ex-history-date">{formatDayTime(locale, session.startedAt)}</span>
                  <span className="ex-history-ago">{daysAgoLabel(t, daysAgo)}</span>
                </div>
                <SetMatrix sets={sets} />
              </div>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}

type ExerciseCardProps = {
  exercise: Exercise;
  /** Fixed-width for a horizontal carousel, or full-width in a vertical list. */
  variant?: 'carousel' | 'block';
  /** When provided, a trash button appears top-right (Trainings context). */
  onRemove?: () => void;
};

/**
 * Exercise card: name, image, and the latest logged training data. Tapping the
 * image opens the full history. Shared by Exercises and the Trainings detail.
 */
export function ExerciseCard({ exercise, variant = 'carousel', onRemove }: ExerciseCardProps) {
  const { exerciseRecords, exerciseLatest, settings, toggleFavorite } = useGym();
  const { t, language, locale } = useLanguage();
  const [showHistory, setShowHistory] = useState(false);
  const latest = exerciseLatest.get(exercise.id) ?? null;
  const best = exerciseRecords.get(exercise.id)?.heaviest;
  const isFavorite = settings.favoriteExerciseIds.includes(exercise.id);
  const displayName = exerciseDisplayName(language, exercise.name);

  return (
    <>
      <div className={`ex-card ex-card-${variant}`}>
        {best && (
          <div className="ex-card-pr num" aria-label={t('exerciseCard.prAria', { reps: best.reps, weight: formatWeight(best.weight) })}>
            <TrophyIcon />
            {formatSet(best.reps, best.weight)}
          </div>
        )}

        <button className="ex-card-media" onClick={() => setShowHistory(true)} aria-label={t('exerciseCard.historyForAria', { name: displayName })}>
          <ExerciseThumb exercise={exercise} name={displayName} className="ex-card-thumb" />
        </button>

        <div className="ex-card-actions">
          <button
            type="button"
            className="ex-card-favorite"
            aria-pressed={isFavorite}
            aria-label={isFavorite ? t('exerciseCard.removeFromFavoritesAria', { name: displayName }) : t('exerciseCard.addToFavoritesAria', { name: displayName })}
            onClick={() => void toggleFavorite(exercise.id)}
          >
            <StarIcon filled={isFavorite} />
          </button>

          {onRemove && (
            <button className="ex-card-remove" onClick={onRemove} aria-label={t('exerciseCard.removeAria', { name: displayName })}>
              <TrashIcon />
            </button>
          )}
        </div>

        <div className="ex-card-body">
          <div className="ex-card-name">{displayName}</div>

          <div className="ex-card-meta">
            {exercise.isCustom && <span className="pill pill-accent">{t('exerciseCard.custom')}</span>}
            <span className="pill">{titleCase(translateFacetValue(language, 'equipment', exercise.equipment))}</span>
            <span className="pill">{titleCase(translateFacetValue(language, 'target', exercise.target))}</span>
          </div>

          {latest ? (
            <>
              <div className="ex-card-latest">
                <span>{formatDay(locale, latest.session.startedAt)}</span>
                <span className="ex-card-latest-ago">{daysAgoLabel(t, latest.daysAgo)}</span>
              </div>
              <SetMatrix sets={latest.sets} />
            </>
          ) : (
            <div className="ex-card-none">{t('exerciseCard.noHistory')}</div>
          )}
        </div>
      </div>

      {showHistory && <ExerciseHistorySheet exercise={exercise} onClose={() => setShowHistory(false)} />}
    </>
  );
}
