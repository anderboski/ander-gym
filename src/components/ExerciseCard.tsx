import { useState } from 'react';
import { useGym } from '../data/store';
import { formatDate, formatDateTime, formatDaysAgo, historyFor, latestFor } from '../data/derive';
import { formatSet, formatWeight, titleCase } from '../data/parse';
import type { Exercise, SetEntry } from '../data/types';
import { Sheet } from './Sheet';
import { TrashIcon } from './icons';
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

/** Full training history for one exercise, newest first. */
export function ExerciseHistorySheet({
  exercise,
  onClose,
}: {
  exercise: Exercise;
  onClose: () => void;
}) {
  const { sessions } = useGym();
  const records = historyFor(exercise.id, sessions);

  return (
    <Sheet title={exercise.name} onClose={onClose} full>
      {records.length === 0 ? (
        <div className="empty">No history yet.</div>
      ) : (
        records.map(({ session, sets, daysAgo }) => (
          <div className="ex-history-entry" key={session.id}>
            <div className="ex-history-head">
              <span className="ex-history-date">{formatDateTime(session.startedAt)}</span>
              <span className="ex-history-ago">{formatDaysAgo(daysAgo)}</span>
            </div>
            <SetMatrix sets={sets} />
          </div>
        ))
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
  const { sessions, exerciseRecords } = useGym();
  const [showHistory, setShowHistory] = useState(false);
  const latest = latestFor(exercise.id, sessions);
  const best = exerciseRecords.get(exercise.id)?.heaviest;

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

        {onRemove && (
          <button className="ex-card-remove" onClick={onRemove} aria-label={`Remove ${exercise.name}`}>
            <TrashIcon />
          </button>
        )}

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
