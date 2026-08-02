/**
 * A saved session, read-only (SPEC §5.5, decision D7).
 *
 * The layout mirrors the active-session table, minus every control that could
 * mutate it: no "+", no set deletion. The only write available is deleting the
 * whole session, which is confirmed first. Everything downstream (Home's
 * counters, each card's latest-training data) recomputes from `sessions`, so
 * deletion needs no extra bookkeeping here.
 */
import { useState } from 'react';
import { useGym } from '../data/store';
import { formatDateTime, formatElapsed, setCount, totalVolume } from '../data/derive';
import { bodyPartsLabel, formatWeight } from '../data/parse';
import { navigate } from '../router';
import { SetMatrix } from '../components/ExerciseCard';
import { ConfirmSheet } from '../components/Sheet';
import { ChevronLeftIcon } from '../components/icons';
import type { Exercise, Session, SessionEntry } from '../data/types';
import './HistoryPage.css';

function BackButton() {
  return (
    <button className="history-back" onClick={() => navigate('/history')} aria-label="Back to history">
      <ChevronLeftIcon />
      <span>History</span>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="history-stat">
      <div className="history-stat-value num">{value}</div>
      <div className="history-stat-label">{label}</div>
    </div>
  );
}

/**
 * One logged exercise. Names and images are resolved at render time from the
 * catalogue — a session only ever snapshots ids — so an exercise removed by an
 * import falls back to its raw id rather than rendering blank.
 */
function EntryRow({ entry, exercise }: { entry: SessionEntry; exercise: Exercise | undefined }) {
  const name = exercise?.name ?? entry.exerciseId;
  const logged = entry.sets.length > 0;

  return (
    <div className={logged ? 'card history-entry' : 'card history-entry history-entry-empty'}>
      <div className="history-entry-thumb">
        {exercise?.imageUrl ? (
          <img
            src={exercise.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            // Images are cached lazily by the SW; a miss while offline should
            // leave the tile blank, not break the row.
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="history-entry-letter">{name.charAt(0).toUpperCase()}</div>
        )}
      </div>

      <div className="history-entry-body">
        <div className="history-entry-name">{name}</div>
        {logged ? (
          <SetMatrix sets={entry.sets} />
        ) : (
          <div className="history-entry-none">Not logged</div>
        )}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <div className="page-header">
        <BackButton />
        <h1 className="page-title">Session not found</h1>
        <div className="page-sub">It may have been deleted, or the link is out of date.</div>
      </div>
      <div className="section">
        <button className="btn btn-primary btn-block" onClick={() => navigate('/history')}>
          Back to History
        </button>
      </div>
    </div>
  );
}

function SessionDetail({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  const { getExercise, deleteSession } = useGym();
  const [confirming, setConfirming] = useState(false);

  const sets = setCount(session);
  const volume = Math.round(totalVolume(session));
  const bodyPart = bodyPartsLabel(session.trainingLabel);

  async function onDelete() {
    setConfirming(false);
    // Flagged before the store update lands, so the parent shows a spinner
    // instead of flashing "Session not found" between delete and navigation.
    onDeleted();
    await deleteSession(session.id);
    navigate('/history');
  }

  return (
    <div className="page">
      <div className="page-header history-detail-header">
        <BackButton />
        <h1 className="page-title num">{formatDateTime(session.startedAt)}</h1>
        <div className="page-sub">
          {session.trainingLabel}
          {bodyPart && ` — ${bodyPart}`}
        </div>

        <div className="history-stats">
          <Stat value={String(sets)} label={sets === 1 ? 'Set' : 'Sets'} />
          <Stat value={volume > 0 ? `${formatWeight(volume)} kg` : '—'} label="Volume" />
          <Stat value={formatElapsed(session.startedAt, new Date(session.savedAt))} label="Duration" />
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Exercises</h2>
        {session.entries.length === 0 ? (
          <div className="empty">This session has no exercises.</div>
        ) : (
          <div className="history-entries">
            {session.entries.map((entry, i) => (
              <EntryRow
                key={`${entry.exerciseId}-${i}`}
                entry={entry}
                exercise={getExercise(entry.exerciseId)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section history-detail-danger">
        <button className="btn btn-danger btn-block" onClick={() => setConfirming(true)}>
          Delete session
        </button>
      </section>

      {confirming && (
        <ConfirmSheet
          title="Delete session?"
          message={`This permanently removes the session from ${formatDateTime(session.startedAt)} and its ${sets} logged ${sets === 1 ? 'set' : 'sets'}. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function HistoryDetailPage({ sessionId }: { sessionId: string }) {
  const { sessions, status } = useGym();
  const [deleting, setDeleting] = useState(false);

  // While the catalogue is still loading `sessions` is empty — that is not the
  // same as a missing session, so don't accuse the user of a bad link yet.
  if (status === 'loading' || deleting) {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return <NotFound />;

  return <SessionDetail session={session} onDeleted={() => setDeleting(true)} />;
}
