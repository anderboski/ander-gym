/**
 * Add a user-created exercise (SPEC §5.2 step 5).
 *
 * The three facet selects are populated from the catalogue's own vocabulary so
 * custom exercises stay searchable through the same chips as built-in ones.
 * The photo is optional and `capture` is deliberately not set: without it iOS
 * offers both "Take Photo" and "Choose from Library".
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { titleCase } from '../data/parse';
import { translateFacetValue } from '../data/exerciseI18n';
import { facetOptions } from '../data/search';
import { useGym } from '../data/store';
import { FACET_LABEL_KEYS, useLanguage } from '../data/i18n';
import { FACET_KEYS, type Exercise, type FacetKey } from '../data/types';
import { Sheet } from './Sheet';
import './ExerciseBrowser.css';

const FORM_ID = 'custom-exercise-form';

export type CustomExerciseFormProps = {
  onClose: () => void;
  /** Called with the created exercise before the sheet closes. */
  onSaved?: (exercise: Exercise) => void;
};

export function CustomExerciseForm({ onClose, onSaved }: CustomExerciseFormProps) {
  const { exercises, addCustomExercise } = useGym();
  const { t, language } = useLanguage();
  const options = useMemo(() => facetOptions(exercises), [exercises]);

  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<FacetKey, string>>(() => ({
    category: options.category[0] ?? '',
    equipment: options.equipment[0] ?? '',
    target: options.target[0] ?? '',
  }));

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const canSave = name.trim().length > 0 && !saving;

  function clearPhoto(): void {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    try {
      const exercise = await addCustomExercise(
        {
          name: name.trim(),
          category: values.category,
          equipment: values.equipment,
          target: values.target,
        },
        photo,
      );
      onSaved?.(exercise);
      onClose();
    } catch (err: unknown) {
      // Most likely the image decode/encode step — keep the form open with
      // everything the user typed still in it.
      setError(err instanceof Error ? err.message : t('customExerciseForm.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('exercises.addExercise')}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form={FORM_ID}
          className="btn btn-primary btn-block"
          disabled={!canSave}
        >
          {saving ? t('common.saving') : t('customExerciseForm.saveExercise')}
        </button>
      }
    >
      <form id={FORM_ID} className="cxf" onSubmit={handleSubmit}>
        {error && (
          <div className="cxf-error" role="alert">
            {error}
          </div>
        )}

        <div className="cxf-field">
          <label className="label" htmlFor="cxf-name">
            {t('common.name')}
          </label>
          <input
            id="cxf-name"
            className="input"
            type="text"
            required
            value={name}
            autoCapitalize="words"
            autoCorrect="off"
            placeholder={t('customExerciseForm.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {FACET_KEYS.map((key) => (
          <div className="cxf-field" key={key}>
            <label className="label" htmlFor={`cxf-${key}`}>
              {t(FACET_LABEL_KEYS[key])}
            </label>
            <select
              id={`cxf-${key}`}
              className="input"
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            >
              {options[key].map((option) => (
                <option key={option} value={option}>
                  {titleCase(translateFacetValue(language, key, option))}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="cxf-field">
          <label className="label" htmlFor="cxf-photo">
            {t('customExerciseForm.photoOptional')}
          </label>
          <input
            id="cxf-photo"
            ref={fileRef}
            className="cxf-file"
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />

          {preview && (
            <div className="cxf-preview">
              <img src={preview} alt={t('customExerciseForm.photoPreviewAlt')} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearPhoto}>
                {t('customExerciseForm.removePhoto')}
              </button>
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
}
