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
import { useLanguage } from '../data/i18n';
import { translateExerciseName, translateFacetValue } from '../data/exerciseI18n';
import {
  adjustRest,
  beatsPersonalRecord,
  formatCountdown,
  formatElapsed,
  latestFor,
  personalRecords,
  remainingSeconds,
  restPhase,
  restProgress,
  startRest,
  type RestTimer,
} from '../data/derive';
import { formatSet, formatWeight, titleCase } from '../data/parse';
import {
  DEFAULT_REST_SECONDS,
  REST_PRESETS,
  type ActiveSession,
  type Exercise,
  type SessionEntry,
  type Session,
  type Training,
} from '../data/types';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseHistorySheet } from '../components/ExerciseCard';
import { ConfirmSheet, Sheet, Toast } from '../components/Sheet';
import { ChevronRightIcon, ClockIcon, PlusIcon, TrashIcon } from '../components/icons';
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

  if (status === 'loading') return <div className="page"><div className="spinner" /></div>;

  // Lifted above the active/no-active switch: `active` clears the instant the
  // session saves, which would unmount this confirmation if it lived in ActiveView.
  const onSaved = (session: Session, originalExerciseIds: string[]) => {
    const finalIds = [...new Set(session.entries.map((e) => e.exerciseId))];
    const addedIds = finalIds.filter((id) => !originalExerciseIds.includes(id));
    const removedIds = originalExerciseIds.filter((id) => !finalIds.includes(id));
    if (addedIds.length === 0 && removedIds.length === 0) {
      navigate('/history');
      return;
    }
    setPendingSync({
      trainingId: session.trainingId,
      trainingLabel: session.trainingLabel,
      addedIds,
      removedIds,
    });
  };

  const syncMessage = (sync: PendingTrainingSync): string => {
    const nameOf = (id: string) => {
      const name = getExercise(id)?.name;
      return name ? translateExerciseName(language, name) : id;
    };
    const parts: string[] = [];
    if (sync.addedIds.length > 0) parts.push(t('session.syncAdd', { names: sync.addedIds.map(nameOf).join(', ') }));
    if (sync.removedIds.length > 0) parts.push(t('session.syncRemove', { names: sync.removedIds.map(nameOf).join(', ') }));
    return t('session.syncMessage', { training: sync.trainingLabel, parts: parts.join(t('session.syncJoiner')) });
  };

  return (
    <>
      {active ? (
        <ActiveView active={active} onSaved={onSaved} />
      ) : (
        <NewSessionView trainings={trainings} />
      )}

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
  // sport day's after-the-fact summary (weather/snow, distance, climbs per
  // grade). Those are logged from the training's own detail page instead
  // (TrainingDetailPage's sportLog form), never started from here.
  const gymTrainings = trainings.filter((tr) => (tr.kind ?? 'gym') === 'gym');
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

      <div className="section sess-centre">
        <div className="card sess-new">
          <div className="sess-new-head">
            <div className="sess-new-title">{t('session.newSession')}</div>
            <div className="sess-new-sub">{t('session.pickTrainingDay')}</div>
          </div>

          {gymTrainings.length === 0 ? (
            <div className="empty">
              {sportOnly ? t('session.gymOnlyHint') : t('session.noTrainingDaysFound')}
            </div>
          ) : (
            gymTrainings.map((tr) => (
              <button
                key={tr.id}
                className="sess-new-row card-tappable"
                onClick={() => start(tr.id)}
                disabled={starting}
              >
                <span className="sess-new-row-text">
                  <span className="sess-new-label">{tr.label}</span>
                </span>
                <span className="sess-new-count num">
                  {tr.exerciseIds.length} {t(tr.exerciseIds.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
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

/* -------------------------------------------------------------------------- */
/* Rest timer                                                                  */
/* -------------------------------------------------------------------------- */

/** Present on Android Chrome, absent on iOS. Feature-detected, never depended on. */
function buzz(): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(180);
}

/** Wall-clock milliseconds, re-read once a second while `running`. */
function useNowMs(running: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    // iOS suspends the interval in a backgrounded tab. Nothing is being counted
    // down — the deadline is absolute — so one read on the way back catches up.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  return nowMs;
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
  const nowMs = useNowMs(rest !== null);
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
    <div className="sess-rest">
      <div className="sess-rest-main">
        {rest ? (
          <>
            <div className={done ? 'sess-rest-time sess-rest-done num' : 'sess-rest-time num'}>
              {done ? t('session.restDone') : formatCountdown(remainingSeconds(rest.targetMs, nowMs))}
            </div>
            <div className="sess-rest-controls">
              <button
                className="btn btn-sm sess-rest-btn num"
                disabled={done}
                aria-label={t('session.restMinus30Aria')}
                onClick={() => onAdjust(-30)}
              >
                −30
              </button>
              <button
                className="btn btn-sm sess-rest-btn num"
                aria-label={t('session.restPlus30Aria')}
                onClick={() => onAdjust(30)}
              >
                +30
              </button>
              <button className="btn btn-sm sess-rest-btn" onClick={onDismiss}>
                {done ? t('session.clear') : t('session.skip')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sess-rest-time sess-rest-idle">
              {t('session.restLabel')} <span className="num">{defaultSeconds}s</span>
            </div>
            <div
              className="sess-rest-controls"
              role="group"
              aria-label={t('session.restLengthAria')}
            >
              {REST_PRESETS.map((seconds) => (
                <button
                  key={seconds}
                  className="chip sess-rest-preset num"
                  aria-pressed={seconds === defaultSeconds}
                  onClick={() => onPickDefault(seconds)}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sess-rest-track" aria-hidden="true">
        <div
          className="sess-rest-fill"
          style={{ width: `${(rest ? restProgress(rest, nowMs) : 0) * 100}%` }}
        />
      </div>
    </div>
  );
}

type PendingDelete = { exerciseId: string; index: number; name: string; label: string };
type PendingRemoveExercise = { exerciseId: string; name: string; setCount: number };

/** The set that just took a record, announced once and then forgotten. */
type NewRecord = { reps: number; weight: number };

function ActiveView({
  active,
  onSaved,
}: {
  active: ActiveSession;
  onSaved: (session: Session, originalExerciseIds: string[]) => void;
}) {
  const {
    sessions,
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
  const now = useNow(30_000);

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingRemoveExercise, setPendingRemoveExercise] = useState<PendingRemoveExercise | null>(
    null,
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<NewRecord | null>(null);
  const [rest, setRest] = useState<RestTimer | null>(null);

  // The training can be renamed or re-timed mid-session; read the default at
  // render time rather than snapshotting it into the active session.
  const training = getTraining(active.trainingId);
  const restSeconds = training?.restSeconds ?? DEFAULT_REST_SECONDS;

  const dismissRest = useCallback(() => setRest(null), []);
  const adjustRestBy = useCallback(
    (delta: number) => setRest((r) => (r ? adjustRest(r, delta, Date.now()) : r)),
    [],
  );

  const totalSets = active.entries.reduce((n, e) => n + e.sets.length, 0);

  // A fresh object per PR, so back-to-back records restart the timer instead of
  // inheriting the first one's remaining time.
  useEffect(() => {
    if (!newRecord) return;
    const t = setTimeout(() => setNewRecord(null), 4000);
    return () => clearTimeout(t);
  }, [newRecord]);

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
  const addingName =
    addingTo === null
      ? ''
      : addingExercise
        ? translateExerciseName(language, addingExercise.name)
        : addingTo;

  return (
    <div className="page sess-page">
      <div className="sess-fixed">
        <div className="page-header sess-head">
          <div>
            <h1 className="page-title">{active.trainingLabel}</h1>
          </div>
          <div className="sess-elapsed num" aria-label={t('session.elapsedAria')}>
            <ClockIcon />
            {formatElapsed(active.startedAt, now)}
          </div>
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
              <button className="btn btn-sm" onClick={() => navigate('/trainings')}>
                {t('home.goToTrainings')}
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
                  onRemove={(name) =>
                    setPendingRemoveExercise({
                      exerciseId: entry.exerciseId,
                      name,
                      setCount: entry.sets.length,
                    })
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
          <button
            className="btn sess-add-exercise btn-block"
            onClick={() => setPickingExercise(true)}
          >
            <PlusIcon />
            {t('exercises.addExercise')}
          </button>
          <button className="btn btn-primary btn-lg btn-block" onClick={onSave}>
            {t('session.saveSession')}
          </button>
          <div className="sess-summary num">
            {t(totalSets === 1 ? 'session.setsLoggedOne' : 'session.setsLoggedOther', { count: totalSets })}
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDiscard(true)}>
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
            // three distinct PRs instead of the same one three times.
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
            excludeIds={active.entries.map((e) => e.exerciseId)}
            renderItem={(exercise) => (
              <SessPickRow
                key={exercise.id}
                exercise={exercise}
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
          message={t('session.deleteSetMessage', {
            label: pendingDelete.label,
            index: pendingDelete.index + 1,
            name: pendingDelete.name,
          })}
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
              : t(
                  pendingRemoveExercise.setCount === 1
                    ? 'session.removeExerciseWithSetsOne'
                    : 'session.removeExerciseWithSetsOther',
                  { name: pendingRemoveExercise.name, count: pendingRemoveExercise.setCount },
                )
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
              : t(totalSets === 1 ? 'session.discardWithSetsOne' : 'session.discardWithSetsOther', {
                  count: totalSets,
                })
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

/** One row in the mid-session "add exercise" picker — appends to the session, not the training. */
function SessPickRow({ exercise, onAdd }: { exercise: Exercise; onAdd: () => void }) {
  const { t, language } = useLanguage();
  const name = translateExerciseName(language, exercise.name);

  return (
    <button className="sess-pick" onClick={onAdd} aria-label={t('trainingDetail.addAria', { name })}>
      <span className="sess-pick-thumb">
        {exercise.imageUrl ? (
          <img src={exercise.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="sess-pick-main">
        <span className="sess-pick-name">{name}</span>
        <span className="sess-pick-meta">
          {titleCase(translateFacetValue(language, 'equipment', exercise.equipment))} ·{' '}
          {titleCase(translateFacetValue(language, 'target', exercise.target))}
        </span>
      </span>
      <span className="sess-pick-add" aria-hidden="true">
        <PlusIcon />
      </span>
    </button>
  );
}

function SessionRow({
  entry,
  exercise,
  onAdd,
  onPickSet,
  onRemove,
}: {
  entry: SessionEntry;
  exercise: Exercise | undefined;
  onAdd: () => void;
  /** index, exercise name and the formatted set, for the delete confirmation. */
  onPickSet: (index: number, name: string, label: string) => void;
  /** Exercise name, for the removal confirmation. */
  onRemove: (name: string) => void;
}) {
  const { t, language } = useLanguage();
  // An id with no catalogue entry can survive an import; show it rather than crash.
  const name = exercise ? translateExerciseName(language, exercise.name) : entry.exerciseId;
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="sess-row">
      {exercise ? (
        <button
          className="sess-thumb-btn"
          onClick={() => setShowHistory(true)}
          aria-label={t('exerciseCard.historyForAria', { name })}
        >
          <RowThumb exercise={exercise} name={name} />
        </button>
      ) : (
        <RowThumb exercise={exercise} name={name} />
      )}

      <div className="sess-name">{name}</div>

      <div className="sess-sets">
        {entry.sets.length === 0 ? (
          <span className="sess-sets-empty" aria-label={t('session.noSetsLoggedAria', { name })}>
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
                aria-label={t('session.setAria', { index: i + 1, name, label })}
              >
                {label}
              </button>
            );
          })
        )}
      </div>

      <button
        className="icon-btn icon-btn-danger sess-remove"
        onClick={() => onRemove(name)}
        aria-label={t('session.removeFromSessionAria', { name })}
      >
        <TrashIcon />
      </button>

      <button className="icon-btn sess-add" onClick={onAdd} aria-label={t('session.addSetAria', { name })}>
        <PlusIcon />
      </button>

      {showHistory && exercise && (
        <ExerciseHistorySheet exercise={exercise} onClose={() => setShowHistory(false)} />
      )}
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
        <button className="btn btn-primary btn-block" onClick={submit}>
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
              {t('session.weightKgLabel')}
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
          <p className="sess-form-hint">{t('session.bodyweightHint')}</p>
        )}

        {/* Lets the iOS keyboard "go" key submit the form. */}
        <button type="submit" className="sess-submit-proxy" tabIndex={-1} aria-hidden="true" />
      </form>
    </Sheet>
  );
}
