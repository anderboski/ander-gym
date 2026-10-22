/**
 * One training day — SPEC §5.3 (gym: its exercise list) and §5.8 (sport:
 * a log form and past logs). Same route, branching on `Training.kind`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BackButton } from '../components/BackButton';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { PickRow } from '../components/PickRow';
import { Sheet, Toast } from '../components/Sheet';
import { SportLogSheet } from '../components/SportLogSheet';
import { ChevronRightIcon, GripIcon, PlusIcon } from '../components/icons';
import { useGym } from '../data/store';
import { formatDayWithWeekday, useLanguage } from '../data/i18n';
import { exerciseDisplayName } from '../data/exerciseI18n';
import { sportSessionSummary, trainingKindLabel } from '../data/sportLabels';
import { parseLocalDate, trainingBadge } from '../data/derive';
import { useDragReorder } from '../hooks/useDragReorder';
import { useTransient } from '../hooks/useTransient';
import type { Exercise, SportSession, Training } from '../data/types';
import { navigate } from '../router';
import './TrainingsPage.css';
import './HistoryPage.css';

export function TrainingDetailPage({ trainingId }: { trainingId: string }) {
  const { getTraining, exerciseById, addExerciseToTraining, removeExerciseFromTraining, reorderTrainingExercises, status } = useGym();
  const { t, language } = useLanguage();
  const [picking, setPicking] = useState(false);
  // The undo offer expires on its own; the removal is already persisted.
  const [undo, setUndo] = useTransient<string>(5000);

  const training = getTraining(trainingId);

  const [order, setOrder] = useState<string[]>(() => training?.exerciseIds ?? []);

  // Re-sync only when the id list itself changes (add/remove/reorder-commit) —
  // must not disturb an in-progress drag's local order otherwise.
  const idsKey = (training?.exerciseIds ?? []).join(',');
  useEffect(() => {
    setOrder(idsKey.split(',').filter(Boolean));
  }, [idsKey]);

  const exercises = useMemo(
    () => order.map((id) => exerciseById.get(id)).filter((ex): ex is Exercise => ex !== undefined),
    [order, exerciseById],
  );

  const drag = useDragReorder(order, setOrder, (next) => void reorderTrainingExercises(trainingId, next));
  const draggingExercise = drag.draggingId ? exerciseById.get(drag.draggingId) : undefined;

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="page">
        <div className="page-header">
          <BackButton to="/trainings" label={t('trainings.title')} />
          <h1 className="page-title">{t('trainingDetail.notFoundTitle')}</h1>
          <div className="page-sub">{t('trainingDetail.notFoundBody')}</div>
        </div>
        <div className="section">
          <button className="btn btn-primary btn-block" onClick={() => navigate('/trainings')}>
            {t('trainingDetail.backToTrainings')}
          </button>
        </div>
      </div>
    );
  }

  if (training.kind && training.kind !== 'gym') {
    return <SportTrainingDetail training={training} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <BackButton to="/trainings" label={t('trainings.title')} />
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">
          {exercises.length} {t(exercises.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </div>
      </div>

      <div className="tr-detail-list">
        {exercises.map((exercise) => (
          <div key={exercise.id} ref={drag.setItemRef(exercise.id)} className={`tr-detail-row${drag.draggingId === exercise.id ? ' tr-card-dragging' : ''}`}>
            <button
              type="button"
              className="tr-card-grip"
              aria-label={t('trainings.reorderAria', { name: exerciseDisplayName(language, exercise.name) })}
              onPointerDown={(e) => drag.onGripDown(exercise.id, e)}
              onPointerMove={drag.onGripMove}
              onPointerUp={drag.onGripUp}
              onPointerCancel={drag.onGripUp}
            >
              <GripIcon />
            </button>

            <div className="tr-detail-row-card">
              <ExerciseCard
                exercise={exercise}
                variant="block"
                onRemove={() => {
                  void removeExerciseFromTraining(training.id, exercise.id);
                  setUndo(exercise.id);
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="tr-detail-actions">
        <button className="btn btn-tinted btn-block" onClick={() => setPicking(true)}>
          <PlusIcon />
          {t('exercises.addExercise')}
        </button>
      </div>

      {drag.ghost &&
        draggingExercise &&
        createPortal(
          <div className="tr-detail-row tr-detail-ghost" style={{ top: drag.ghost.top, left: drag.ghost.left, width: drag.ghost.width, height: drag.ghost.height }}>
            <span className="tr-card-grip" aria-hidden="true">
              <GripIcon />
            </span>
            <div className="tr-detail-row-card">
              <ExerciseCard exercise={draggingExercise} variant="block" />
            </div>
          </div>,
          document.body,
        )}

      {picking && (
        <Sheet title={t('exercises.addExercise')} onClose={() => setPicking(false)} full>
          <ExerciseBrowser
            layout="list"
            disabledIds={training.exerciseIds}
            renderItem={(exercise, { disabled }) => (
              <PickRow
                key={exercise.id}
                exercise={exercise}
                disabled={disabled}
                context="training"
                onAdd={() => {
                  void addExerciseToTraining(training.id, exercise.id);
                  setPicking(false);
                }}
              />
            )}
          />
        </Sheet>
      )}

      {undo && (
        <Toast
          message={t('trainingDetail.exerciseRemoved')}
          actionLabel={t('common.undo')}
          onAction={() => {
            void addExerciseToTraining(training.id, undo);
            setUndo(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sport trainings — log form + past logs, no exercises, no rotation           */
/* -------------------------------------------------------------------------- */

function SportLogRow({ session, badge }: { session: SportSession; badge: string }) {
  const { t, locale } = useLanguage();

  return (
    <button className="history-row card-row" onClick={() => navigate(`/history/${session.id}`)}>
      <span className="history-row-badge" aria-hidden="true">
        {badge}
      </span>
      <span className="history-row-main">
        <span className="history-row-title">{formatDayWithWeekday(locale, parseLocalDate(session.date))}</span>
        <span className="history-row-summary">{sportSessionSummary(t, session)}</span>
      </span>
      <ChevronRightIcon className="history-row-chevron" />
    </button>
  );
}

function SportTrainingDetail({ training }: { training: Training }) {
  const { t } = useLanguage();
  const { sportSessions, logSportSession } = useGym();
  const [logging, setLogging] = useState(false);

  const logs = useMemo(
    () =>
      sportSessions
        .filter((s) => s.trainingId === training.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sportSessions, training.id],
  );
  const badge = trainingBadge(training);

  return (
    <div className="page">
      <div className="page-header">
        <BackButton to="/trainings" label={t('trainings.title')} />
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">{trainingKindLabel(t, training.kind ?? 'gym')}</div>
      </div>

      <div className="tr-sport-log">
        <button className="btn btn-primary btn-block btn-lg" onClick={() => setLogging(true)}>
          <PlusIcon />
          {t('sportLog.logButton')}
        </button>
      </div>

      <section className="section">
        {logs.length === 0 ? (
          <div className="empty">{t('sportLog.noLogsYet')}</div>
        ) : (
          <div className="card">
            {logs.map((session) => (
              <SportLogRow key={session.id} session={session} badge={badge} />
            ))}
          </div>
        )}
      </section>

      {logging && <SportLogSheet training={training} onClose={() => setLogging(false)} onSubmit={(input) => logSportSession(training.id, input)} />}
    </div>
  );
}
