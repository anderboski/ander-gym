import { useEffect, useState } from 'react';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { Sheet, Toast } from '../components/Sheet';
import { ChevronLeftIcon, PlusIcon } from '../components/icons';
import { titleCase } from '../data/parse';
import { useGym } from '../data/store';
import { useLanguage } from '../data/i18n';
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
  const { getTraining, getExercise, addExerciseToTraining, removeExerciseFromTraining, status } =
    useGym();
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

  const exercises = training.exerciseIds
    .map((id) => getExercise(id))
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
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            variant="block"
            onRemove={() => {
              void removeExerciseFromTraining(training.id, exercise.id);
              setUndo(exercise.id);
            }}
          />
        ))}

        <button className="tr-add-card" onClick={() => setPicking(true)}>
          <PlusIcon />
          {t('exercises.addExercise')}
        </button>
      </div>

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
