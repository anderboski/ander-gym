import { useLanguage } from '../data/i18n';
import { exerciseDisplayName, translateFacetValue } from '../data/exerciseI18n';
import { titleCase } from '../data/parse';
import type { Exercise } from '../data/types';
import { ExerciseThumb } from './ExerciseThumb';
import { CheckIcon, PlusIcon } from './icons';

/**
 * One row in an exercise picker — the Trainings detail "+" and the mid-session
 * "Add exercise" share it. An exercise the caller already holds stays in the
 * results, disabled and labelled, rather than being dropped (SPEC §5.3, §5.4).
 */
export function PickRow({
  exercise,
  disabled,
  context,
  onAdd,
}: {
  exercise: Exercise;
  disabled: boolean;
  /** Which wording the disabled state uses. */
  context: 'training' | 'session';
  onAdd: () => void;
}) {
  const { t, language } = useLanguage();
  const name = exerciseDisplayName(language, exercise.name);
  const alreadyKey = context === 'training' ? 'trainingDetail.alreadyAdded' : 'session.alreadyAdded';
  const alreadyAriaKey = context === 'training' ? 'trainingDetail.alreadyAddedAria' : 'session.alreadyAddedAria';

  return (
    <button
      type="button"
      className="pick-row"
      onClick={onAdd}
      disabled={disabled}
      aria-label={disabled ? t(alreadyAriaKey, { name }) : t('trainingDetail.addAria', { name })}
    >
      <ExerciseThumb exercise={exercise} name={name} className="pick-row-thumb" />
      <span className="pick-row-main">
        <span className="pick-row-name">{name}</span>
        <span className="pick-row-meta">
          {disabled
            ? t(alreadyKey)
            : `${titleCase(translateFacetValue(language, 'equipment', exercise.equipment))} · ${titleCase(
                translateFacetValue(language, 'target', exercise.target),
              )}`}
        </span>
      </span>
      <span className="pick-row-add" aria-hidden="true">
        {disabled ? <CheckIcon /> : <PlusIcon />}
      </span>
    </button>
  );
}
