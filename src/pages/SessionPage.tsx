/**
 * Session page — SPEC §5.4.
 *
 * Two states, switched on `active` from the store:
 *   A. no active session -> a "New Session" card listing the training days;
 *   B. an active session  -> elapsed-time header, one row per exercise, and the
 *      save / discard actions at the end of the page.
 *
 * Every set write goes straight through the store to IndexedDB, so a force-quit
 * mid-workout loses nothing and this page keeps no draft state of its own.
 */
import { useCallback, useEffect, useState } from 'react';
import { useGym } from '../data/store';
import { formatElapsed, latestFor } from '../data/derive';
import { formatSet, formatWeight } from '../data/parse';
import type { ActiveSession, Exercise, SessionEntry, Session, Training } from '../data/types';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { ChevronRightIcon, ClockIcon, PlusIcon } from '../components/icons';
import { navigate } from '../router';
import './SessionPage.css';

export function SessionPage() {
  const { status, active, trainings } = useGym();

  if (status === 'loading') return <div className="page"><div className="spinner" /></div>;

  return active ? <ActiveView active={active} /> : <NewSessionView trainings={trainings} />;
}

/* -------------------------------------------------------------------------- */
/* State A — no active session                                                 */
/* -------------------------------------------------------------------------- */

function NewSessionView({ trainings }: { trainings: Training[] }) {
  const { startSession } = useGym();
  const [starting, setStarting] = useState(false);

  const start = (id: string) => {
    if (starting) return;
    setStarting(true);
    // The store swaps `active` in; this component unmounts on success.
    startSession(id).catch(() => setStarting(false));
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Session</h1>
        <div className="page-sub">Nothing in progress</div>
      </div>

      <div className="section sess-centre">
        <div className="card sess-new">
          <div className="sess-new-head">
            <div className="sess-new-title">New Session</div>
            <div className="sess-new-sub">Pick a training day to start.</div>
          </div>

          {trainings.length === 0 ? (
            <div className="empty">No training days found.</div>
          ) : (
            trainings.map((t) => (
              <button
                key={t.id}
                className="sess-new-row card-tappable"
                onClick={() => start(t.id)}
                disabled={starting}
              >
                <span className="sess-new-row-text">
                  <span className="sess-new-label">{t.label}</span>
                </span>
                <span className="sess-new-count num">
                  {t.exerciseIds.length === 1 ? '1 exercise' : `${t.exerciseIds.length} exercises`}
                </span>
                <ChevronRightIcon className="sess-new-chevron" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* State B — active session                                                    */
/* -------------------------------------------------------------------------- */

/** Ticks every 30 s — a minute-resolution clock does not need a 1 s interval. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    // iOS throttles timers in the background; resync the moment we come back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}

type PendingDelete = { exerciseId: string; index: number; name: string; label: string };

function ActiveView({ active }: { active: ActiveSession }) {
  const { sessions, getExercise, addSet, removeSet, saveSession, discardSession } = useGym();
  const now = useNow(30_000);

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const totalSets = active.entries.reduce((n, e) => n + e.sets.length, 0);

  const onSave = () => {
    saveSession()
      .then((saved) => {
        if (saved) navigate('/history');
        else setNotice('Log at least one set before saving — or discard the session below.');
      })
      .catch(() => setNotice('Could not save the session. Try again.'));
  };

  const openAdd = useCallback((exerciseId: string) => {
    setNotice(null);
    setAddingTo(exerciseId);
  }, []);

  const addingExercise = addingTo === null ? null : getExercise(addingTo);
  const addingName = addingTo === null ? '' : addingExercise?.name ?? addingTo;

  return (
    <div className="page">
      <div className="page-header sess-head">
        <div>
          <h1 className="page-title">{active.trainingLabel}</h1>
        </div>
        <div className="sess-elapsed num" aria-label="Elapsed time">
          <ClockIcon />
          {formatElapsed(active.startedAt, now)}
        </div>
      </div>

      <div className="section">
        {active.entries.length === 0 ? (
          <div className="card card-pad sess-hint">
            <p className="sess-hint-title">This training has no exercises yet.</p>
            <p className="sess-hint-body">
              Add some from the Trainings tab, then come back — the session keeps running.
            </p>
            <button className="btn btn-sm" onClick={() => navigate('/trainings')}>
              Go to Trainings
            </button>
          </div>
        ) : (
          <div className="card sess-table">
            {active.entries.map((entry) => (
              <SessionRow
                key={entry.exerciseId}
                entry={entry}
                exercise={getExercise(entry.exerciseId)}
                onAdd={() => openAdd(entry.exerciseId)}
                onPickSet={(index, name, label) =>
                  setPendingDelete({ exerciseId: entry.exerciseId, index, name, label })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="section sess-actions">
        {notice && (
          <p className="sess-notice" role="alert">
            {notice}
          </p>
        )}
        <button className="btn btn-primary btn-lg btn-block" onClick={onSave}>
          Save session
        </button>
        <div className="sess-summary num">
          {totalSets === 1 ? '1 set logged' : `${totalSets} sets logged`}
        </div>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDiscard(true)}>
          Discard session
        </button>
      </div>

      {addingTo !== null && (
        <SetSheet
          exerciseName={addingName}
          prefill={prefillFor(addingTo, active, sessions)}
          onClose={() => setAddingTo(null)}
          onSave={(reps, weight) => {
            const id = addingTo;
            setAddingTo(null);
            void addSet(id, reps, weight);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmSheet
          title="Delete set?"
          message={`${pendingDelete.label} — set ${pendingDelete.index + 1} of ${pendingDelete.name}.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void removeSet(target.exerciseId, target.index);
          }}
        />
      )}

      {confirmDiscard && (
        <ConfirmSheet
          title="Discard session?"
          message={
            totalSets === 0
              ? 'Nothing has been logged yet. The session will be thrown away.'
              : `${totalSets} logged ${totalSets === 1 ? 'set' : 'sets'} will be thrown away. This cannot be undone.`
          }
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            void discardSession();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

function RowThumb({ exercise, name }: { exercise: Exercise | undefined; name: string }) {
  const [broken, setBroken] = useState(false);
  const url = exercise?.imageUrl ?? null;

  // No photo (custom exercise), or the image is not in the offline cache.
  if (!url || broken) {
    return <div className="sess-thumb sess-thumb-letter">{name.charAt(0).toUpperCase()}</div>;
  }
  return (
    <img
      className="sess-thumb"
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

function SessionRow({
  entry,
  exercise,
  onAdd,
  onPickSet,
}: {
  entry: SessionEntry;
  exercise: Exercise | undefined;
  onAdd: () => void;
  /** index, exercise name and the formatted set, for the delete confirmation. */
  onPickSet: (index: number, name: string, label: string) => void;
}) {
  // An id with no catalogue entry can survive an import; show it rather than crash.
  const name = exercise?.name ?? entry.exerciseId;

  return (
    <div className="sess-row">
      <RowThumb exercise={exercise} name={name} />

      <div className="sess-name">{name}</div>

      <div className="sess-sets">
        {entry.sets.length === 0 ? (
          <span className="sess-sets-empty" aria-label={`No sets logged for ${name}`}>
            —
          </span>
        ) : (
          entry.sets.map((set, i) => {
            const label = formatSet(set.reps, set.weight);
            return (
              <button
                key={`${set.at}-${i}`}
                className="sess-set num"
                onClick={() => onPickSet(i, name, label)}
                aria-label={`Set ${i + 1} of ${name}, ${label}. Tap to delete.`}
              >
                {label}
              </button>
            );
          })
        )}
      </div>

      <button className="icon-btn sess-add" onClick={onAdd} aria-label={`Add set to ${name}`}>
        <PlusIcon />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Add-set sheet                                                               */
/* -------------------------------------------------------------------------- */

type Prefill = { reps: string; weight: string };

/**
 * Previous set of this exercise in this session, else its most recent logged
 * set ever, else empty.
 */
function prefillFor(exerciseId: string, active: ActiveSession, sessions: Session[]): Prefill {
  const entry = active.entries.find((e) => e.exerciseId === exerciseId);
  const inSession = entry?.sets.at(-1);
  if (inSession) return { reps: String(inSession.reps), weight: formatWeight(inSession.weight) };

  const historic = latestFor(exerciseId, sessions)?.sets.at(-1);
  if (historic) return { reps: String(historic.reps), weight: formatWeight(historic.weight) };

  return { reps: '', weight: '' };
}

function SetSheet({
  exerciseName,
  prefill,
  onSave,
  onClose,
}: {
  exerciseName: string;
  prefill: Prefill;
  onSave: (reps: number, weight: number) => void;
  onClose: () => void;
}) {
  const [reps, setReps] = useState(prefill.reps);
  const [weight, setWeight] = useState(prefill.weight);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const repsValue = Number(reps.trim());
    if (!Number.isInteger(repsValue) || repsValue <= 0) {
      setError('Reps must be a whole number greater than 0.');
      return;
    }

    // Empty weight means bodyweight. Some iOS locales type a decimal comma.
    const rawWeight = weight.trim().replace(',', '.');
    const weightValue = rawWeight === '' ? 0 : Number(rawWeight);
    if (!Number.isFinite(weightValue) || weightValue < 0) {
      setError('Weight must be 0 or more. Leave it empty for bodyweight.');
      return;
    }

    onSave(repsValue, weightValue);
  };

  return (
    <Sheet
      title={exerciseName}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={submit}>
          Save set
        </button>
      }
    >
      <form
        className="sess-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="sess-fields">
          <div>
            <label className="label" htmlFor="set-reps">
              Reps
            </label>
            <input
              id="set-reps"
              className="input num"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="10"
              value={reps}
              onChange={(e) => {
                setReps(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="set-weight">
              Weight (kg)
            </label>
            <input
              id="set-weight"
              className="input num"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>

        {error ? (
          <p className="sess-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="sess-form-hint">Leave the weight empty for a bodyweight set.</p>
        )}

        {/* Lets the iOS keyboard "go" key submit the form. */}
        <button type="submit" className="sess-submit-proxy" tabIndex={-1} aria-hidden="true" />
      </form>
    </Sheet>
  );
}
