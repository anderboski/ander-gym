import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { Sheet, Toast } from '../components/Sheet';
import { ChevronLeftIcon, GripIcon, PlusIcon } from '../components/icons';
import { titleCase } from '../data/parse';
import { useGym } from '../data/store';
import { useLanguage } from '../data/i18n';
import { useDragReorder } from '../hooks/useDragReorder';
import type { Exercise } from '../data/types';
import { navigate } from '../router';
import './TrainingsPage.css';

/** One row in the "add exercise" picker. */
function PickerRow({ exercise, onAdd }: { exercise: Exercise; onAdd: () => void }) {
  const { t } = useLanguage();

  return (
    <button className="tr-pick" onClick={onAdd} aria-label={t('trainingDetail.addAria', { name: exercise.name })}>
      <span className="tr-pick-thumb">
        {exercise.imageUrl ? (
          <img src={exercise.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          exercise.name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="tr-pick-main">
        <span className="tr-pick-name">{exercise.name}</span>
        <span className="tr-pick-meta">
          {titleCase(exercise.equipment)} · {titleCase(exercise.target)}
        </span>
      </span>
      <span className="tr-pick-add" aria-hidden="true">
        <PlusIcon />
      </span>
    </button>
  );
}

export function TrainingDetailPage({ trainingId }: { trainingId: string }) {
  const {
    getTraining,
    getExercise,
    addExerciseToTraining,
    removeExerciseFromTraining,
    reorderTrainingExercises,
    status,
  } = useGym();
  const { t } = useLanguage();
  const [picking, setPicking] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);

  const training = getTraining(trainingId);

  // The undo offer expires on its own; the removal is already persisted.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const [order, setOrder] = useState<string[]>(() => training?.exerciseIds ?? []);

  // Re-sync only when the id list itself changes (add/remove/reorder-commit) —
  // must not disturb an in-progress drag's local order otherwise.
  const idsKey = (training?.exerciseIds ?? []).join(',');
  useEffect(() => {
    setOrder(idsKey.split(',').filter(Boolean));
  }, [idsKey]);

  const exerciseById = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const id of training?.exerciseIds ?? []) {
      const exercise = getExercise(id);
      if (exercise) map.set(id, exercise);
    }
    return map;
  }, [idsKey]);

  const drag = useDragReorder(
    order,
    setOrder,
    (next) => void reorderTrainingExercises(trainingId, next),
  );
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
          <h1 className="page-title">{t('trainingDetail.notFoundTitle')}</h1>
        </div>
        <div className="empty">
          {t('trainingDetail.notFoundBody')}
          <div style={{ marginTop: 'var(--s4)' }}>
            <button className="btn" onClick={() => navigate('/trainings')}>
              {t('trainingDetail.backToTrainings')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const exercises = order
    .map((id) => exerciseById.get(id))
    .filter((ex): ex is Exercise => ex !== undefined);

  return (
    <div className="page">
      <button className="tr-back" onClick={() => navigate('/trainings')}>
        <ChevronLeftIcon />
        {t('trainings.title')}
      </button>

      <div className="page-header" style={{ paddingTop: 'var(--s2)' }}>
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">
          {exercises.length} {t(exercises.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </div>
      </div>

      <div className="tr-detail-list">
        {exercises.map((exercise) => (
          <div
            key={exercise.id}
            ref={drag.setItemRef(exercise.id)}
            className={`tr-detail-row${drag.draggingId === exercise.id ? ' tr-card-dragging' : ''}`}
          >
            <button
              type="button"
              className="tr-card-grip"
              aria-label={t('trainings.reorderAria', { name: exercise.name })}
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

        <button className="tr-add-card" onClick={() => setPicking(true)}>
          <PlusIcon />
          {t('exercises.addExercise')}
        </button>
      </div>

      {drag.ghost &&
        draggingExercise &&
        createPortal(
          <div
            className="tr-detail-row tr-detail-ghost"
            style={{
              top: drag.ghost.top,
              left: drag.ghost.left,
              width: drag.ghost.width,
              height: drag.ghost.height,
            }}
          >
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
            excludeIds={training.exerciseIds}
            renderItem={(exercise) => (
              <PickerRow
                key={exercise.id}
                exercise={exercise}
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
