/**
 * Profile — a push view off Home, same arrangement as Stats (SPEC D1 locks
 * the tab bar at five; this route reports `home` from `tabOf()`).
 */
import { useEffect, useState } from 'react';
import { useGym } from '../data/store';
import { ageFrom, bmi, formatShortLocalDate } from '../data/derive';
import { formatWeight } from '../data/parse';
import { useLanguage } from '../data/i18n';
import { ChartFigure, LineChart } from '../components/Chart';
import { ConfirmSheet } from '../components/Sheet';
import { ProfileEditSheet } from '../components/ProfileEditSheet';
import { CheckinSheet } from '../components/CheckinSheet';
import { ChevronLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { navigate } from '../router';
import type { WeightCheckin } from '../data/types';
import './ProfilePage.css';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="profile-stat">
      <div className="profile-stat-value num">{value}</div>
      <div className="profile-stat-label">{label}</div>
    </div>
  );
}

const kg = (value: number) => `${formatWeight(Math.round(value * 10) / 10)} kg`;

/**
 * Trend of logged weight. Same three-shape design as ExerciseCard's progress
 * chart: nothing plottable, a single reading (a figure, not a line), and an
 * actual line from two check-ins up.
 */
function WeightTrend({ checkins }: { checkins: WeightCheckin[] }) {
  const { t } = useLanguage();
  // `checkins` arrives newest-first from the store; charting reads left to right.
  const points = [...checkins].reverse();

  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return (
      <ChartFigure title={t('profile.weightTrendTitle')}>
        <div className="profile-progress-none">{t('profile.noCheckinsYet')}</div>
      </ChartFigure>
    );
  }

  const delta = last.weightKg - first.weightKg;
  const trend =
    delta > 0
      ? t('exerciseCard.trendUp', { kg: kg(delta) })
      : delta < 0
        ? t('exerciseCard.trendDown', { kg: kg(-delta) })
        : t('exerciseCard.trendNoChange');

  if (points.length === 1) {
    return (
      <ChartFigure
        title={t('profile.weightTrendTitle')}
        value={kg(last.weightKg)}
        caption={t('profile.oneCheckinCaption', { date: formatShortLocalDate(last.date) })}
      >
        <div className="profile-progress-single num">{kg(last.weightKg)}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('profile.weightTrendTitle')}
      value={kg(last.weightKg)}
      caption={
        <>
          {points.length} {t('profile.checkinsOther')} · {formatShortLocalDate(first.date)} →{' '}
          {formatShortLocalDate(last.date)} ·{' '}
          <span className="num">
            {delta > 0 ? '+' : ''}
            {kg(delta)}
          </span>
        </>
      }
    >
      <LineChart
        values={points.map((c) => c.weightKg)}
        formatTick={(v) => formatWeight(Math.round(v * 10) / 10)}
        xLabels={[formatShortLocalDate(first.date), formatShortLocalDate(last.date)]}
        ariaLabel={t('profile.weightTrendAria', {
          title: t('profile.weightTrendTitle'),
          count: points.length,
          firstKg: kg(first.weightKg),
          firstDate: formatShortLocalDate(first.date),
          lastKg: kg(last.weightKg),
          lastDate: formatShortLocalDate(last.date),
          trend,
        })}
      />
    </ChartFigure>
  );
}

/** A check-in's photo, downscaled and stored as a blob — needs an object URL to render. */
function CheckinPhoto({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;
  return <img className="profile-checkin-photo" src={url} alt="" loading="lazy" />;
}

function CheckinRow({
  checkin,
  previous,
  onDelete,
}: {
  checkin: WeightCheckin;
  previous: WeightCheckin | undefined;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const delta = previous ? checkin.weightKg - previous.weightKg : null;

  return (
    <div className="profile-checkin-row">
      <div className="profile-checkin-main">
        <span className="profile-checkin-date num">{checkin.date}</span>
        <span className="profile-checkin-weight num">{kg(checkin.weightKg)}</span>
        {delta !== null && delta !== 0 && (
          <span className="profile-checkin-delta num">
            {delta > 0 ? '+' : ''}
            {kg(delta)}
          </span>
        )}
      </div>

      {checkin.photoBlobs.length > 0 && (
        <div className="profile-checkin-photos">
          {checkin.photoBlobs.map((blob, i) => (
            <CheckinPhoto key={i} blob={blob} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="icon-btn icon-btn-danger profile-checkin-delete"
        onClick={onDelete}
        aria-label={t('profile.deleteCheckinAria', { date: checkin.date })}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

export function ProfilePage() {
  const { profile, checkins, deleteCheckin } = useGym();
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WeightCheckin | null>(null);

  const now = new Date();
  const age = profile.birthdate ? ageFrom(profile.birthdate, now) : null;
  const latestWeight = checkins[0]?.weightKg ?? null;
  const bmiValue = latestWeight !== null && profile.heightCm ? bmi(latestWeight, profile.heightCm) : null;
  const hasAnyStat = age !== null || profile.heightCm !== null || bmiValue !== null;

  return (
    <div className="page">
      <button className="profile-back" onClick={() => navigate('/home')} aria-label={t('stats.backToHomeAria')}>
        <ChevronLeftIcon />
        <span>{t('tabbar.home')}</span>
      </button>

      <div className="page-header profile-header" style={{ paddingTop: 'var(--s2)' }}>
        <div className="profile-name-row">
          <h1 className="page-title">{profile.name.trim() || t('profile.addName')}</h1>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEditing(true)}
            aria-label={t('profile.editAria')}
          >
            <PencilIcon />
          </button>
        </div>

        {hasAnyStat && (
          <div className="profile-stats">
            {age !== null && <Stat value={String(age)} label={t('profile.ageLabel')} />}
            {profile.heightCm !== null && (
              <Stat value={`${profile.heightCm} cm`} label={t('profile.heightLabel')} />
            )}
            {bmiValue !== null && <Stat value={bmiValue.toFixed(1)} label={t('profile.bmiLabel')} />}
          </div>
        )}
      </div>

      <section className="section">
        <div className="card card-pad">
          <WeightTrend checkins={checkins} />
        </div>
      </section>

      <section className="section">
        <button className="profile-add-checkin" onClick={() => setLoggingWeight(true)}>
          <PlusIcon />
          {t('profile.logWeight')}
        </button>
      </section>

      {checkins.length > 0 && (
        <section className="section">
          <div className="section-title">{t('profile.checkinsSection')}</div>
          <div className="profile-checkin-list">
            {checkins.map((c, i) => (
              <CheckinRow
                key={c.id}
                checkin={c}
                previous={checkins[i + 1]}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </div>
        </section>
      )}

      {editing && <ProfileEditSheet profile={profile} onClose={() => setEditing(false)} />}
      {loggingWeight && <CheckinSheet onClose={() => setLoggingWeight(false)} />}

      {pendingDelete && (
        <ConfirmSheet
          title={t('profile.deleteCheckinTitle')}
          message={t('profile.deleteCheckinMessage', { date: pendingDelete.date })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void deleteCheckin(id);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
