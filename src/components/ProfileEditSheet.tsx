import { useState, type FormEvent } from 'react';
import { useGym } from '../data/store';
import { useLanguage } from '../data/i18n';
import { Sheet } from './Sheet';
import type { Profile } from '../data/types';
import '../pages/ProfilePage.css';

const FORM_ID = 'profile-edit-form';

export function ProfileEditSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { setProfile } = useGym();
  const { t } = useLanguage();

  const [name, setName] = useState(profile.name);
  const [birthdate, setBirthdate] = useState(profile.birthdate ?? '');
  const [heightText, setHeightText] = useState(
    profile.heightCm !== null ? String(profile.heightCm) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmedHeight = heightText.trim().replace(',', '.');
    const heightCm = trimmedHeight === '' ? null : Number(trimmedHeight);
    if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0)) {
      setError(t('profile.heightError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setProfile({ name: name.trim(), birthdate: birthdate || null, heightCm });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('trainings.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('profile.editTitle')}
      onClose={onClose}
      footer={
        <button type="submit" form={FORM_ID} className="btn btn-primary btn-block" disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
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
          <label className="label" htmlFor="profile-name">
            {t('common.name')}
          </label>
          <input
            id="profile-name"
            className="input"
            type="text"
            autoCapitalize="words"
            autoCorrect="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="profile-form-field">
          <label className="label" htmlFor="profile-birthdate">
            {t('profile.birthdateLabel')}
          </label>
          <input
            id="profile-birthdate"
            className="input"
            type="date"
            value={birthdate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </div>

        <div className="profile-form-field">
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
