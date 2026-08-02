/**
 * Exercises (SPEC §5.2): sticky search, three facet chip rows, match count and
 * a snap-scrolling card carousel, plus the custom-exercise form.
 *
 * Search/facet/window logic lives in <ExerciseBrowser> because the Trainings
 * picker reuses it in list mode.
 */
import { useState } from 'react';
import { CustomExerciseForm } from '../components/CustomExerciseForm';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { PlusIcon } from '../components/icons';
import { useGym } from '../data/store';
import './ExercisesPage.css';

export function ExercisesPage() {
  const { status, error } = useGym();
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <div className="page-header exercises-header">
        <h1 className="page-title">Exercises</h1>
        <button
          className="btn btn-sm btn-primary exercises-add"
          onClick={() => setAdding(true)}
        >
          <PlusIcon />
          Add exercise
        </button>
      </div>

      {status === 'loading' && <div className="spinner" aria-label="Loading exercises" />}

      {status === 'error' && (
        <div className="empty">{error ?? 'The exercise catalogue could not be loaded.'}</div>
      )}

      {status === 'ready' && (
        <ExerciseBrowser
          layout="carousel"
          renderItem={(ex) => <ExerciseCard key={ex.id} exercise={ex} variant="carousel" />}
        />
      )}

      {adding && <CustomExerciseForm onClose={() => setAdding(false)} />}
    </div>
  );
}
