import { useState, type FormEvent } from 'react';
import { useGym } from '../data/store';
import { dayKey } from '../data/derive';
import { useLanguage } from '../data/i18n';
import { squareCropImage } from '../data/exercises';
import { AvatarFace } from './Avatar';
import { Sheet } from './Sheet';
import type { Profile } from '../data/types';
import '../pages/ProfilePage.css';

const FORM_ID = 'profile-edit-form';

export function ProfileEditSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { setProfile } = useGym();
  const { t } = useLanguage();

  const [name, setName] = useState(profile.name);
  const [birthdate, setBirthdate] = useState(profile.birthdate ?? '');
  const [heightText, setHeightText] = useState(profile.heightCm !== null ? String(profile.heightCm) : '');
  const [photo, setPhoto] = useState<Blob | null>(profile.photoBlob);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (processingPhoto) return;

    const trimmedHeight = heightText.trim().replace(',', '.');
    const heightCm = trimmedHeight === '' ? null : Number(trimmedHeight);
    if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0)) {
      setError(t('profile.heightError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setProfile({ name: name.trim(), birthdate: birthdate || null, heightCm, photoBlob: photo });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  async function handlePhoto(file: File) {
    setProcessingPhoto(true);
    setError(null);
    try {
      // Cropped on pick, not on save: the preview then shows exactly what the
      // avatar will, and the full-size original never reaches IndexedDB.
      setPhoto(await squareCropImage(file));
    } catch {
      setError(t('profile.photoError'));
    } finally {
      setProcessingPhoto(false);
    }
  }

  return (
    <Sheet
      title={t('profile.editTitle')}
      onClose={onClose}
      footer={
        <button type="submit" form={FORM_ID} className="btn btn-primary btn-block" disabled={saving || processingPhoto}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        {error && (
          <div className="form-error field" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <div className="label" id="profile-photo-label">
            {t('profile.photoLabel')}
          </div>
          <div className="profile-photo-field">
            <span className="avatar avatar-lg" aria-hidden="true">
              <AvatarFace name={name} photoBlob={photo} />
            </span>
            <label className="btn btn-sm btn-tinted profile-photo-add">
              {photo ? t('profile.changePhoto') : t('profile.choosePhoto')}
              <input
                className="profile-photo-input"
                type="file"
                accept="image/*"
                aria-labelledby="profile-photo-label"
                disabled={processingPhoto}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared so picking the same photo again still fires onChange.
                  e.target.value = '';
                  if (file) void handlePhoto(file);
                }}
              />
            </label>
            {photo && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPhoto(null)}>
                {t('profile.removePhoto')}
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="profile-name">
            {t('common.name')}
          </label>
          <input id="profile-name" className="input" type="text" autoCapitalize="words" autoCorrect="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="profile-birthdate">
            {t('profile.birthdateLabel')}
          </label>
          <input id="profile-birthdate" className="input" type="date" value={birthdate} max={dayKey(new Date())} onChange={(e) => setBirthdate(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="profile-height">
            {t('profile.heightCmFieldLabel')}
          </label>
          <input
            id="profile-height"
            className="input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={heightText}
            onChange={(e) => {
              setHeightText(e.target.value);
              setError(null);
            }}
          />
        </div>
      </form>
    </Sheet>
  );
}
