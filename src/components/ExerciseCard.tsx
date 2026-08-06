import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  exerciseProgress,
  formatDate,
  formatDateTime,
  formatDaysAgo,
  formatShortDate,
  historyFor,
  type ExerciseRecord,
  type ProgressMetric,
} from '../data/derive';
import { formatSet, formatWeight, titleCase } from '../data/parse';
import type { Exercise, SetEntry } from '../data/types';
import { ChartFigure, LineChart } from './Chart';
import { Sheet } from './Sheet';
import { StarIcon, TrashIcon } from './icons';
import './ExerciseCard.css';

/** Two-column reps/weight table — the "training matrix" from the spec. */
export function SetMatrix({ sets }: { sets: SetEntry[] }) {
  return (
    <table className="set-matrix">
      <thead>
        <tr>
          <th scope="col">Reps</th>
          <th scope="col">Weight</th>
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

function Thumb({ exercise }: { exercise: Exercise }) {
  if (!exercise.imageUrl) {
    return <div className="ex-card-placeholder">{exercise.name.charAt(0).toUpperCase()}</div>;
  }
  return (
    <img
      src={exercise.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      // Cached lazily by the service worker; offline and never-viewed images
      // simply fail to load rather than breaking the card.
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Progress chart (SPEC §5.2)                                                  */
/* -------------------------------------------------------------------------- */

const METRICS: Record<ProgressMetric, { label: string; title: string }> = {
  topWeight: { label: 'Top set', title: 'Top-set weight' },
  e1rm: { label: 'Est. 1RM', title: 'Estimated 1RM' },
};

/** Toggle order. Top set first: it is the number the user actually lifted. */
const METRIC_ORDER: ProgressMetric[] = ['topWeight', 'e1rm'];

const kg = (value: number) => `${formatWeight(Math.round(value * 10) / 10)} kg`;

/**
 * Trend of one exercise over its own history.
 *
 * Three shapes rather than one, because a chart of nothing is worse than no
 * chart: nothing plottable at all, a single reading (a figure, not a line —
 * one point is not a trend), and an actual line from two sessions up.
 */
function ExerciseProgress({ history }: { history: ExerciseRecord[] }) {
  const [metric, setMetric] = useState<ProgressMetric>('topWeight');
  const points = useMemo(() => exerciseProgress(history, metric), [history, metric]);

  const active = METRICS[metric];
  const toggle = (
    <div className="ex-progress-toggle" role="group" aria-label="Chart metric">
      {METRIC_ORDER.map((id) => (
        <button
          key={id}
          className="ex-progress-metric"
          aria-pressed={id === metric}
          onClick={() => setMetric(id)}
        >
          {METRICS[id].label}
        </button>
      ))}
    </div>
  );

  const first = points[0];
  const last = points[points.length - 1];

  // Logged, but never with weight: Epley and a weight axis both need a load.
  if (!first || !last) {
    return (
      <div className="ex-progress ex-progress-none">
        Logged at bodyweight only — there is no load to chart yet.
      </div>
    );
  }

  const delta = last.value - first.value;
  const trend = delta > 0 ? `up ${kg(delta)}` : delta < 0 ? `down ${kg(-delta)}` : 'no change';

  if (points.length === 1) {
    return (
      <div className="ex-progress">
        <ChartFigure
          title={active.title}
          value={kg(last.value)}
          action={toggle}
          caption={`One session logged, on ${formatShortDate(last.at)} — a second one starts the trend.`}
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
        value={kg(last.value)}
        action={toggle}
        caption={
          <>
            {points.length} sessions · {formatShortDate(first.at)} → {formatShortDate(last.at)} ·{' '}
            <span className="num">
              {delta > 0 ? '+' : ''}
              {kg(delta)}
            </span>
          </>
        }
      >
        <LineChart
          values={points.map((p) => p.value)}
          formatTick={(v) => formatWeight(Math.round(v * 10) / 10)}
          xLabels={[formatShortDate(first.at), formatShortDate(last.at)]}
          ariaLabel={`${active.title} across ${points.length} sessions: ${kg(first.value)} on ${formatShortDate(first.at)} to ${kg(last.value)} on ${formatShortDate(last.at)}, ${trend}.`}
        />
      </ChartFigure>
    </div>
  );
}

/** Full training history for one exercise, newest first. */
export function ExerciseHistorySheet({
  exercise,
  onClose,
}: {
  exercise: Exercise;
  onClose: () => void;
}) {
  const { sessions } = useGym();
  const records = useMemo(() => historyFor(exercise.id, sessions), [exercise.id, sessions]);

  return (
    <Sheet title={exercise.name} onClose={onClose} full>
      {records.length === 0 ? (
        <div className="empty">No history yet.</div>
      ) : (
        <>
          <ExerciseProgress history={records} />
          {records.map(({ session, sets, daysAgo }) => (
            <div className="ex-history-entry" key={session.id}>
              <div className="ex-history-head">
                <span className="ex-history-date">{formatDateTime(session.startedAt)}</span>
                <span className="ex-history-ago">{formatDaysAgo(daysAgo)}</span>
              </div>
              <SetMatrix sets={sets} />
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

export type ExerciseCardProps = {
  exercise: Exercise;
  /** Fixed-width for a horizontal carousel, or full-width in a vertical list. */
  variant?: 'carousel' | 'block';
  /** When provided, a trash button appears top-right (Trainings context). */
  onRemove?: () => void;
};

/**
 * Exercise card: name, image, and the latest logged training data. Tapping the
 * image opens the full history. Shared by Exercises, Trainings and the picker.
 */
export function ExerciseCard({ exercise, variant = 'carousel', onRemove }: ExerciseCardProps) {
  const { exerciseRecords, exerciseLatest, settings, toggleFavorite } = useGym();
  const [showHistory, setShowHistory] = useState(false);
  const latest = exerciseLatest.get(exercise.id) ?? null;
  const best = exerciseRecords.get(exercise.id)?.heaviest;
  const isFavorite = settings.favoriteExerciseIds.includes(exercise.id);

  return (
    <>
      <div className={`ex-card ex-card-${variant}`}>
        {best && (
          <div
            className="ex-card-pr num"
            aria-label={`Personal record: ${best.reps} reps at ${formatWeight(best.weight)} kilograms`}
          >
            <span aria-hidden="true">🏆</span>
            {formatSet(best.reps, best.weight)}
          </div>
        )}

        <button
          className="ex-card-media"
          onClick={() => setShowHistory(true)}
          aria-label={`History for ${exercise.name}`}
        >
          <Thumb exercise={exercise} />
        </button>

        <div className="ex-card-actions">
          <button
            type="button"
            className="ex-card-favorite"
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${exercise.name} from favorites` : `Add ${exercise.name} to favorites`}
            onClick={() => void toggleFavorite(exercise.id)}
          >
            <StarIcon filled={isFavorite} />
          </button>

          {onRemove && (
            <button className="ex-card-remove" onClick={onRemove} aria-label={`Remove ${exercise.name}`}>
              <TrashIcon />
            </button>
          )}
        </div>

        <div className="ex-card-body">
          <div className="ex-card-name">{exercise.name}</div>

          <div className="ex-card-meta">
            {exercise.isCustom && <span className="pill pill-accent">Custom</span>}
            <span className="pill">{titleCase(exercise.equipment)}</span>
            <span className="pill">{titleCase(exercise.target)}</span>
          </div>

          {latest ? (
            <>
              <div className="ex-card-latest">
                <span>{formatDate(latest.session.startedAt)}</span>
                <span style={{ color: 'var(--text-faint)' }}>{formatDaysAgo(latest.daysAgo)}</span>
              </div>
              <SetMatrix sets={latest.sets} />
            </>
          ) : (
            <div className="ex-card-none">No history yet</div>
          )}
        </div>
      </div>

      {showHistory && (
        <ExerciseHistorySheet exercise={exercise} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}
