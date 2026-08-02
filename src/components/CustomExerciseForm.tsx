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
import { facetOptions } from '../data/search';
import { useGym } from '../data/store';
import { FACET_KEYS, FACET_LABELS, type Exercise, type FacetKey } from '../data/types';
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
      setError(err instanceof Error ? err.message : 'Could not save the exercise.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Add exercise"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form={FORM_ID}
          className="btn btn-primary btn-block"
          disabled={!canSave}
        >
          {saving ? 'Saving…' : 'Save exercise'}
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
            Name
          </label>
          <input
            id="cxf-name"
            className="input"
            type="text"
            required
            value={name}
            autoCapitalize="words"
            autoCorrect="off"
            placeholder="e.g. Cable crossover"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {FACET_KEYS.map((key) => (
          <div className="cxf-field" key={key}>
            <label className="label" htmlFor={`cxf-${key}`}>
              {FACET_LABELS[key]}
            </label>
            <select
              id={`cxf-${key}`}
              className="input"
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            >
              {options[key].map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="cxf-field">
          <label className="label" htmlFor="cxf-photo">
            Photo (optional)
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
              <img src={preview} alt="Selected photo preview" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearPhoto}>
                Remove photo
              </button>
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
}
