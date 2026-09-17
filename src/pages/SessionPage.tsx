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
 *
 * The one exception is the rest timer, which is deliberately ephemeral: a
 * half-finished rest is not training data, and reloading the app mid-rest is
 * rare enough that persisting it would cost more than it is worth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGym } from '../data/store';
import { daysAgoLabel, useLanguage } from '../data/i18n';
import { exerciseDisplayName } from '../data/exerciseI18n';
import {
  adjustRest,
  beatsPersonalRecord,
  diffExerciseIds,
  formatCountdown,
  formatElapsed,
  lastSetFor,
  personalRecords,
  remainingSeconds,
  restPhase,
  restProgress,
  startRest,
  trainingBadge,
  type ExerciseRecord,
  type RestTimer,
} from '../data/derive';
import { formatSet, formatWeight, summariseSets } from '../data/parse';
import { DEFAULT_REST_SECONDS, REST_PRESETS, type ActiveSession, type Exercise, type SessionEntry, type Session, type Training } from '../data/types';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseHistorySheet } from '../components/ExerciseCard';
import { ExerciseThumb } from '../components/ExerciseThumb';
import { PickRow } from '../components/PickRow';
import { ConfirmSheet, Sheet, Toast } from '../components/Sheet';
import { ChevronRightIcon, ClockIcon, PlusIcon, TrashIcon } from '../components/icons';
import { useClock } from '../hooks/useClock';
import { useTransient } from '../hooks/useTransient';
import { navigate } from '../router';
import './SessionPage.css';

/**
 * How the final, saved set of exercises differs from what the training had
 * when the session started — exercises added via "+ Add exercise" and/or
 * exercises removed mid-session. Offered back to the training after save.
 */
type PendingTrainingSync = {
  trainingId: string;
  trainingLabel: string;
  addedIds: string[];
  removedIds: string[];
};

export function SessionPage() {
  const { status, active, trainings, getExercise, syncTrainingExercises } = useGym();
  const { t, language } = useLanguage();
  const [pendingSync, setPendingSync] = useState<PendingTrainingSync | null>(null);

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  // Lifted above the active/no-active switch: `active` clears the instant the
  // session saves, which would unmount this confirmation if it lived in ActiveView.
  const onSaved = (session: Session, originalExerciseIds: string[]) => {
    const { addedIds, removedIds } = diffExerciseIds(originalExerciseIds, session);
    if (addedIds.length === 0 && removedIds.length === 0) {
      navigate('/history');
      return;
    }
    setPendingSync({ trainingId: session.trainingId, trainingLabel: session.trainingLabel, addedIds, removedIds });
  };

  const syncMessage = (sync: PendingTrainingSync): string => {
    const nameOf = (id: string) => {
      const name = getExercise(id)?.name;
      return name ? exerciseDisplayName(language, name) : id;
    };
    const parts: string[] = [];
    if (sync.addedIds.length > 0) parts.push(t('session.syncAdd', { names: sync.addedIds.map(nameOf).join(', ') }));
    if (sync.removedIds.length > 0) parts.push(t('session.syncRemove', { names: sync.removedIds.map(nameOf).join(', ') }));
    return t('session.syncMessage', { training: sync.trainingLabel, parts: parts.join(t('session.syncJoiner')) });
  };

  return (
    <>
      {active ? <ActiveView active={active} onSaved={onSaved} /> : <NewSessionView trainings={trainings} />}

      {pendingSync && (
        <ConfirmSheet
          title={t('session.updateTrainingTitle')}
          message={syncMessage(pendingSync)}
          confirmLabel={t('session.update')}
          onCancel={() => {
            setPendingSync(null);
            navigate('/history');
          }}
          onConfirm={() => {
            const { trainingId, addedIds, removedIds } = pendingSync;
            setPendingSync(null);
            syncTrainingExercises(trainingId, addedIds, removedIds)
              .catch(() => {})
              .finally(() => navigate('/history'));
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* State A — no active session                                                 */
/* -------------------------------------------------------------------------- */

function NewSessionView({ trainings }: { trainings: Training[] }) {
  const { startSession } = useGym();
  const { t } = useLanguage();
  const [starting, setStarting] = useState(false);

  // A session here is the live, set-by-set gym flow — it has no shape for a
  // sport day's after-the-fact summary. Those are logged from the training's
  // own detail page instead (TrainingDetailPage's sportLog form).
  const gymTrainings = trainings.filter((tr) => !tr.archived && (tr.kind ?? 'gym') === 'gym');
  const sportOnly = gymTrainings.length === 0 && trainings.length > 0;

  const start = (id: string) => {
    if (starting) return;
    setStarting(true);
    // The store swaps `active` in; this component unmounts on success.
    startSession(id).catch(() => setStarting(false));
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('tabbar.session')}</h1>
        <div className="page-sub">{t('session.nothingInProgress')}</div>
      </div>

      <div className="section">
        <div className="section-title">{t('session.pickTrainingDay')}</div>
        {gymTrainings.length === 0 ? (
          <div className="card">
            <div className="empty">{sportOnly ? t('session.gymOnlyHint') : t('session.noTrainingDaysFound')}</div>
          </div>
        ) : (
          <div className="card">
            {gymTrainings.map((tr) => (
              <button key={tr.id} className="sess-new-row card-row" onClick={() => start(tr.id)} disabled={starting}>
                <span className="sess-new-badge" aria-hidden="true">
                  {trainingBadge(tr)}
                </span>
                <span className="sess-new-text">
                  <span className="sess-new-label">{tr.label}</span>
                  <span className="sess-new-count">
                    {tr.exerciseIds.length} {t(tr.exerciseIds.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
                  </span>
                </span>
                <ChevronRightIcon className="sess-new-chevron" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* State B — active session                                                    */
/* -------------------------------------------------------------------------- */

/** Present on Android Chrome, absent on iOS. Feature-detected, never depended on. */
function buzz(): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(180);
}

/**
 * The bar under the session title. It renders the same shape in both states —
 * countdown or presets — so starting and clearing a rest never moves the
 * exercise table.
 */
function RestBar({
  rest,
  defaultSeconds,
  onAdjust,
  onDismiss,
  onPickDefault,
}: {
  rest: RestTimer | null;
  /** This training day's stored default, resolved by the caller. */
  defaultSeconds: number;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
  onPickDefault: (seconds: number) => void;
}) {
  const { t } = useLanguage();
  const nowMs = useClock(1000, rest !== null);
  const phase = rest ? restPhase(rest, nowMs) : null;
  const done = phase === 'done';

  // Keyed on the deadline, so it fires once per rest and again after a ±30 s
  // adjustment moves the deadline — but never twice for the same zero.
  const buzzedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!rest || !done || buzzedFor.current === rest.targetMs) return;
    buzzedFor.current = rest.targetMs;
    buzz();
  }, [rest, done]);

  // A rest the user never came back to: clear it silently instead of announcing
  // one that finished while the app was in the background.
  useEffect(() => {
    if (phase === 'expired') onDismiss();
  }, [phase, onDismiss]);

  return (
    <div className={rest ? 'sess-rest sess-rest-running' : 'sess-rest'}>
      <div className="sess-rest-main">
        {rest ? (
          <>
            <div className={done ? 'sess-rest-time sess-rest-done num' : 'sess-rest-time num'}>
              {done ? t('session.restDone') : formatCountdown(remainingSeconds(rest.targetMs, nowMs))}
            </div>
            <div className="sess-rest-controls">
              <button className="btn btn-sm sess-rest-btn num" disabled={done} aria-label={t('session.restMinus30Aria')} onClick={() => onAdjust(-30)}>
                −30
              </button>
              <button className="btn btn-sm sess-rest-btn num" aria-label={t('session.restPlus30Aria')} onClick={() => onAdjust(30)}>
                +30
              </button>
              <button className="btn btn-sm sess-rest-btn sess-rest-skip" onClick={onDismiss}>
                {done ? t('session.clear') : t('session.skip')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sess-rest-time sess-rest-idle">{t('session.restLabel')}</div>
            <div className="segment sess-rest-presets" role="group" aria-label={t('session.restLengthAria')}>
              {REST_PRESETS.map((seconds) => (
                <button key={seconds} className="segment-btn num" aria-pressed={seconds === defaultSeconds} onClick={() => onPickDefault(seconds)}>
                  {seconds}s
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sess-rest-track" aria-hidden="true">
        <div className="sess-rest-fill" style={{ width: `${(rest ? restProgress(rest, nowMs) : 0) * 100}%` }} />
      </div>
    </div>
  );
}

type PendingDelete = { exerciseId: string; index: number; name: string; label: string };
type PendingRemoveExercise = { exerciseId: string; name: string; setCount: number };

/** The set that just took a record, announced once and then forgotten. */
type NewRecord = { reps: number; weight: number };

function ActiveView({ active, onSaved }: { active: ActiveSession; onSaved: (session: Session, originalExerciseIds: string[]) => void }) {
  const {
    sessions,
    exerciseLatest,
    getExercise,
    getTraining,
    addExerciseToSession,
    removeExerciseFromSession,
    addSet,
    removeSet,
    saveSession,
    discardSession,
    setTrainingRest,
  } = useGym();
  const { t, language } = useLanguage();
  // A minute-resolution clock does not need a 1 s interval.
  const now = new Date(useClock(30_000));

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingRemoveExercise, setPendingRemoveExercise] = useState<PendingRemoveExercise | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A fresh object per record, so back-to-back records restart the timer.
  const [newRecord, setNewRecord] = useTransient<NewRecord>(4000);
  const [rest, setRest] = useState<RestTimer | null>(null);

  // The training can be renamed or re-timed mid-session; read the default at
  // render time rather than snapshotting it into the active session.
  const training = getTraining(active.trainingId);
  const restSeconds = training?.restSeconds ?? DEFAULT_REST_SECONDS;

  const dismissRest = useCallback(() => setRest(null), []);
  const adjustRestBy = useCallback((delta: number) => setRest((r) => (r ? adjustRest(r, delta, Date.now()) : r)), []);

  const totalSets = active.entries.reduce((n, e) => n + e.sets.length, 0);

  const onSave = () => {
    const originalExerciseIds = training?.exerciseIds ?? [];
    saveSession()
      .then((saved) => {
        if (saved) onSaved(saved, originalExerciseIds);
        else setNotice(t('session.logAtLeastOneSet'));
      })
      .catch(() => setNotice(t('session.couldNotSaveSession')));
  };

  const openAdd = useCallback((exerciseId: string) => {
    setNotice(null);
    setAddingTo(exerciseId);
  }, []);

  const addingExercise = addingTo === null ? null : getExercise(addingTo);
  const addingName = addingTo === null ? '' : addingExercise ? exerciseDisplayName(language, addingExercise.name) : addingTo;

  return (
    <div className="page sess-page">
      <div className="sess-fixed">
        <div className="page-header sess-head">
          <div className="sess-head-text">
            <div className="sess-elapsed num" aria-label={t('session.elapsedAria')}>
              <ClockIcon />
              {formatElapsed(active.startedAt, now)}
              <span className="sess-elapsed-sep">·</span>
              {t(totalSets === 1 ? 'session.setsLoggedOne' : 'session.setsLoggedOther', { count: totalSets })}
            </div>
            <h1 className="page-title">{active.trainingLabel}</h1>
          </div>
          <button className="icon-btn icon-btn-filled sess-discard-btn" aria-label={t('session.discardSession')} onClick={() => setConfirmDiscard(true)}>
            <TrashIcon />
          </button>
        </div>

        <RestBar
          rest={rest}
          defaultSeconds={restSeconds}
          onAdjust={adjustRestBy}
          onDismiss={dismissRest}
          onPickDefault={(seconds) => void setTrainingRest(active.trainingId, seconds)}
        />
      </div>

      <div className="sess-scroll">
        <div className="section">
          {active.entries.length === 0 ? (
            <div className="card card-pad sess-hint">
              <p className="sess-hint-title">{t('session.noExercisesYet')}</p>
              <p className="sess-hint-body">{t('session.addFromTrainingsHint')}</p>
            </div>
          ) : (
            <div className="card sess-table">
              {active.entries.map((entry) => (
                <SessionRow
                  key={entry.exerciseId}
                  entry={entry}
                  exercise={getExercise(entry.exerciseId)}
                  latest={exerciseLatest.get(entry.exerciseId)}
                  onAdd={() => openAdd(entry.exerciseId)}
                  onPickSet={(index, name, label) => setPendingDelete({ exerciseId: entry.exerciseId, index, name, label })}
                  onRemove={(name) => setPendingRemoveExercise({ exerciseId: entry.exerciseId, name, setCount: entry.sets.length })}
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
          <button className="btn btn-tinted btn-block" onClick={() => setPickingExercise(true)}>
            <PlusIcon />
            {t('exercises.addExercise')}
          </button>
          <button className="btn btn-primary btn-lg btn-block" onClick={onSave}>
            {t('session.saveSession')}
          </button>
          <button className="btn btn-ghost btn-sm sess-discard" onClick={() => setConfirmDiscard(true)}>
            {t('session.discardSession')}
          </button>
        </div>
      </div>

      {addingTo !== null && (
        <SetSheet
          exerciseName={addingName}
          prefill={prefillFor(addingTo, active, sessions)}
          onClose={() => setAddingTo(null)}
          onSave={(reps, weight) => {
            const id = addingTo;
            setAddingTo(null);
            // The baseline includes this session's own sets — `active` still
            // holds the pre-save entries here — so three ascending sets report
            // three distinct records instead of the same one three times.
            if (beatsPersonalRecord({ reps, weight }, personalRecords(id, [...sessions, active]))) {
              setNewRecord({ reps, weight });
            }
            // Restarts on every saved set, including one saved mid-rest.
            setRest(startRest(restSeconds, Date.now()));
            void addSet(id, reps, weight);
          }}
        />
      )}

      {pickingExercise && (
        <Sheet title={t('exercises.addExercise')} onClose={() => setPickingExercise(false)} full>
          <ExerciseBrowser
            layout="list"
            disabledIds={active.entries.map((e) => e.exerciseId)}
            renderItem={(exercise, { disabled }) => (
              <PickRow
                key={exercise.id}
                exercise={exercise}
                disabled={disabled}
                context="session"
                onAdd={() => {
                  void addExerciseToSession(exercise.id);
                  setPickingExercise(false);
                }}
              />
            )}
          />
        </Sheet>
      )}

      {newRecord && <Toast message={t('session.newPrToast', { set: formatSet(newRecord.reps, newRecord.weight) })} />}

      {pendingDelete && (
        <ConfirmSheet
          title={t('session.deleteSetTitle')}
          message={t('session.deleteSetMessage', { label: pendingDelete.label, index: pendingDelete.index + 1, name: pendingDelete.name })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void removeSet(target.exerciseId, target.index);
          }}
        />
      )}

      {pendingRemoveExercise && (
        <ConfirmSheet
          title={t('session.removeExerciseTitle')}
          message={
            pendingRemoveExercise.setCount === 0
              ? t('session.removeExerciseNoSets', { name: pendingRemoveExercise.name })
              : t(pendingRemoveExercise.setCount === 1 ? 'session.removeExerciseWithSetsOne' : 'session.removeExerciseWithSetsOther', {
                  name: pendingRemoveExercise.name,
                  count: pendingRemoveExercise.setCount,
                })
          }
          confirmLabel={t('session.remove')}
          danger
          onCancel={() => setPendingRemoveExercise(null)}
          onConfirm={() => {
            const target = pendingRemoveExercise;
            setPendingRemoveExercise(null);
            void removeExerciseFromSession(target.exerciseId);
          }}
        />
      )}

      {confirmDiscard && (
        <ConfirmSheet
          title={t('session.discardSessionTitle')}
          message={
            totalSets === 0
              ? t('session.discardEmpty')
              : t(totalSets === 1 ? 'session.discardWithSetsOne' : 'session.discardWithSetsOther', { count: totalSets })
          }
          confirmLabel={t('session.discard')}
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

/** Sets from the previous session shown inline; the rest are counted as "+N". */
const LAST_TIME_MAX_SETS = 3;

function SessionRow({
  entry,
  exercise,
  latest,
  onAdd,
  onPickSet,
  onRemove,
}: {
  entry: SessionEntry;
  exercise: Exercise | undefined;
  /** The last session this exercise was logged in, or undefined with no history. */
  latest: ExerciseRecord | undefined;
  onAdd: () => void;
  /** index, exercise name and the formatted set, for the delete confirmation. */
  onPickSet: (index: number, name: string, label: string) => void;
  /** Exercise name, for the removal confirmation. */
  onRemove: (name: string) => void;
}) {
  const { t, language } = useLanguage();
  // An id with no catalogue entry can survive an import; show it rather than crash.
  const name = exercise ? exerciseDisplayName(language, exercise.name) : entry.exerciseId;
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="sess-row card-row">
      {exercise ? (
        <button className="sess-thumb-btn" onClick={() => setShowHistory(true)} aria-label={t('exerciseCard.historyForAria', { name })}>
          <ExerciseThumb exercise={exercise} name={name} />
        </button>
      ) : (
        <ExerciseThumb exercise={exercise} name={name} />
      )}

      <div className="sess-main">
        <div className="sess-name">{name}</div>
        {latest && <LastTime latest={latest} />}
        {entry.sets.length > 0 && (
          <div className="sess-sets">
            {entry.sets.map((set, i) => {
              const label = formatSet(set.reps, set.weight);
              return (
                <button key={`${set.at}-${i}`} className="sess-set num" onClick={() => onPickSet(i, name, label)} aria-label={t('session.setAria', { index: i + 1, name, label })}>
                  <span className="sess-set-index">{i + 1}</span>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sess-row-actions">
        <button className="sess-add" onClick={onAdd} aria-label={t('session.addSetAria', { name })}>
          <PlusIcon />
        </button>
        <button className="sess-remove" onClick={() => onRemove(name)} aria-label={t('session.removeFromSessionAria', { name })}>
          <TrashIcon />
        </button>
      </div>

      {showHistory && exercise && <ExerciseHistorySheet exercise={exercise} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

/**
 * What this exercise was last logged at, under its name — SPEC §5.4. Read off
 * `useGym().exerciseLatest` (one pass over history for the whole app) rather
 * than `latestFor` per row.
 */
function LastTime({ latest }: { latest: ExerciseRecord }) {
  const { t } = useLanguage();
  const { text, more } = summariseSets(latest.sets, LAST_TIME_MAX_SETS);
  const ago = daysAgoLabel(t, latest.daysAgo);

  return (
    <div className="sess-last" role="note" aria-label={t('session.lastTimeAria', { ago, sets: text })}>
      <span className="sess-last-ago">{ago}</span>
      <span className="sess-last-sets num">{text}</span>
      {more > 0 && <span className="num">{t('session.lastTimeMore', { count: more })}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Add-set sheet                                                               */
/* -------------------------------------------------------------------------- */

type Prefill = { reps: string; weight: string };

/** Previous set of this exercise in this session, else its most recent logged set ever, else empty. */
function prefillFor(exerciseId: string, active: ActiveSession, sessions: Session[]): Prefill {
  const last = lastSetFor(exerciseId, active, sessions);
  return last ? { reps: String(last.reps), weight: formatWeight(last.weight) } : { reps: '', weight: '' };
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
  const { t } = useLanguage();
  const [reps, setReps] = useState(prefill.reps);
  const [weight, setWeight] = useState(prefill.weight);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const repsValue = Number(reps.trim());
    if (!Number.isInteger(repsValue) || repsValue <= 0) {
      setError(t('session.repsError'));
      return;
    }

    // Empty weight means bodyweight. Some iOS locales type a decimal comma.
    const rawWeight = weight.trim().replace(',', '.');
    const weightValue = rawWeight === '' ? 0 : Number(rawWeight);
    if (!Number.isFinite(weightValue) || weightValue < 0) {
      setError(t('session.weightError'));
      return;
    }

    onSave(repsValue, weightValue);
  };

  return (
    <Sheet
      title={exerciseName}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block btn-lg" onClick={submit}>
          {t('session.saveSet')}
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
              {t('exerciseCard.reps')}
            </label>
            <input
              id="set-reps"
              className="input sess-input num"
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
              {t('session.weightKgLabel')}
            </label>
            <input
              id="set-weight"
              className="input sess-input num"
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
          <p className="hint">{t('session.bodyweightHint')}</p>
        )}

        {/* Lets the iOS keyboard "go" key submit the form. */}
        <button type="submit" className="sess-submit-proxy" tabIndex={-1} aria-hidden="true" />
      </form>
    </Sheet>
  );
}
