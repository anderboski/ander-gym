import { useEffect, useState, type FormEvent } from 'react';
import { useGym } from '../data/store';
import { dayKey } from '../data/derive';
import { useLanguage } from '../data/i18n';
import { Sheet } from './Sheet';
import { CloseIcon } from './icons';
import '../pages/ProfilePage.css';

const FORM_ID = 'checkin-form';

/** A picked-but-unsaved photo, with its own object URL for the preview. */
function PhotoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="profile-photo-preview">
      {url && <img src={url} alt="" />}
      <button
        type="button"
        className="profile-photo-remove"
        onClick={onRemove}
        aria-label={t('session.remove')}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function CheckinSheet({ onClose }: { onClose: () => void }) {
  const { addCheckin } = useGym();
  const { t } = useLanguage();

  const [date, setDate] = useState(() => dayKey(new Date()));
  const [weightText, setWeightText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addPhotos(files: File[]) {
    setPhotos((current) => [...current, ...files]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const weightKg = Number(weightText.trim().replace(',', '.'));
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setError(t('checkin.weightError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addCheckin({ date, weightKg, photos });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('profile.logWeight')}
      onClose={onClose}
      footer={
        <button type="submit" form={FORM_ID} className="btn btn-primary btn-block" disabled={saving}>
          {saving ? t('common.saving') : t('checkin.saveCheckin')}
        </button>
      }
    >
      <form id={FORM_ID} className="profile-form" onSubmit={handleSubmit}>
        {error && (
          <div className="profile-form-error" role="alert">
            {error}
          </div>
        )}

        <div className="profile-form-field">
          <label className="label" htmlFor="checkin-date">
            {t('checkin.dateLabel')}
          </label>
          <input
            id="checkin-date"
            className="input"
            type="date"
            required
            value={date}
            max={dayKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="profile-form-field">
          <label className="label" htmlFor="checkin-weight">
            {t('session.weightKgLabel')}
          </label>
          <input
            id="checkin-weight"
            className="input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={weightText}
            onChange={(e) => {
              setWeightText(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className="profile-form-field">
          <label className="label" htmlFor="checkin-photos">
            {t('checkin.photosLabel')}
          </label>
          <label className="btn btn-block profile-photo-add">
            {t('checkin.addPhotos')}
            <input
              id="checkin-photos"
              className="profile-photo-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                // Copy to a plain array synchronously before clearing the
                // input — `e.target.files` is a *live* FileList, and clearing
                // `.value` empties it in place. Since `setState` updater
                // functions run later, passing the live list straight through
                // would race: by the time React invokes the updater, the list
                // it closed over could already be empty.
                addPhotos(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </label>

          {photos.length > 0 && (
            <div className="profile-photo-list">
              {photos.map((file, i) => (
                <PhotoPreview key={i} file={file} onRemove={() => removePhoto(i)} />
              ))}
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
}
