/**
 * Profile — a push view off Home, same arrangement as Stats (SPEC D1 locks
 * the tab bar at five; this route reports `home` from `tabOf()`).
 */
import { useState } from 'react';
import { useGym } from '../data/store';
import { ageFrom, bmi, parseLocalDate } from '../data/derive';
import { formatKg, formatKgDelta, formatWeight } from '../data/parse';
import { formatDay, formatDayWithWeekday, useLanguage } from '../data/i18n';
import { BackButton } from '../components/BackButton';
import { ChartFigure, LineChart } from '../components/Chart';
import { ConfirmSheet } from '../components/Sheet';
import { StatRow, StatTile } from '../components/StatTile';
import { ProfileEditSheet } from '../components/ProfileEditSheet';
import { CheckinSheet } from '../components/CheckinSheet';
import { PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { useObjectUrl } from '../hooks/useObjectUrl';
import type { WeightCheckin } from '../data/types';
import './ProfilePage.css';

/**
 * Trend of logged weight. Same three-shape design as ExerciseCard's progress
 * chart: nothing plottable, a single reading (a figure, not a line), and an
 * actual line from two check-ins up.
 */
function WeightTrend({ checkins }: { checkins: WeightCheckin[] }) {
  const { t, locale } = useLanguage();
  // `checkins` arrives newest-first from the store; charting reads left to right.
  const points = [...checkins].reverse();

  const first = points[0];
  const last = points[points.length - 1];
  const day = (c: WeightCheckin) => formatDay(locale, parseLocalDate(c.date));

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
      ? t('exerciseCard.trendUp', { kg: formatKg(delta) })
      : delta < 0
        ? t('exerciseCard.trendDown', { kg: formatKg(-delta) })
        : t('exerciseCard.trendNoChange');

  if (points.length === 1) {
    return (
      <ChartFigure title={t('profile.weightTrendTitle')} value={formatKg(last.weightKg)} caption={t('profile.oneCheckinCaption', { date: day(last) })}>
        <div className="profile-progress-single num">{formatKg(last.weightKg)}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('profile.weightTrendTitle')}
      value={formatKg(last.weightKg)}
      caption={
        <>
          {points.length} {t('profile.checkinsOther')} · {day(first)} → {day(last)} · <span className="num">{formatKgDelta(delta)}</span>
        </>
      }
    >
      <LineChart
        values={points.map((c) => c.weightKg)}
        formatTick={(v) => formatWeight(Math.round(v * 10) / 10)}
        xLabels={[day(first), day(last)]}
        ariaLabel={t('profile.weightTrendAria', {
          title: t('profile.weightTrendTitle'),
          count: points.length,
          firstKg: formatKg(first.weightKg),
          firstDate: day(first),
          lastKg: formatKg(last.weightKg),
          lastDate: day(last),
          trend,
        })}
      />
    </ChartFigure>
  );
}

/** A check-in's photo, downscaled and stored as a blob — needs an object URL to render. */
function CheckinPhoto({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  if (!url) return null;
  return <img className="profile-checkin-photo" src={url} alt="" loading="lazy" />;
}

function CheckinRow({ checkin, previous, onDelete }: { checkin: WeightCheckin; previous: WeightCheckin | undefined; onDelete: () => void }) {
  const { t, locale } = useLanguage();
  const delta = previous ? checkin.weightKg - previous.weightKg : null;

  return (
    <div className="profile-checkin-row card-row">
      <div className="profile-checkin-main">
        <span className="profile-checkin-weight num">{formatKg(checkin.weightKg)}</span>
        <span className="profile-checkin-date">{formatDayWithWeekday(locale, parseLocalDate(checkin.date))}</span>
      </div>

      {delta !== null && delta !== 0 && (
        <span className={delta > 0 ? 'profile-checkin-delta num profile-checkin-up' : 'profile-checkin-delta num profile-checkin-down'}>
          {formatKgDelta(delta)}
        </span>
      )}

      {checkin.photoBlobs.length > 0 && (
        <div className="profile-checkin-photos">
          {checkin.photoBlobs.map((blob, i) => (
            <CheckinPhoto key={i} blob={blob} />
          ))}
        </div>
      )}

      <button type="button" className="icon-btn profile-checkin-delete" onClick={onDelete} aria-label={t('profile.deleteCheckinAria', { date: checkin.date })}>
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
      <div className="page-header profile-header">
        <BackButton to="/home" label={t('tabbar.home')} ariaLabel={t('stats.backToHomeAria')} />
        <div className="profile-name-row">
          <h1 className="page-title">{profile.name.trim() || t('profile.addName')}</h1>
          <button type="button" className="icon-btn icon-btn-filled" onClick={() => setEditing(true)} aria-label={t('profile.editAria')}>
            <PencilIcon />
          </button>
        </div>

        {hasAnyStat && (
          <div className="profile-stats">
            <StatRow>
              {age !== null && <StatTile value={String(age)} label={t('profile.ageLabel')} />}
              {profile.heightCm !== null && <StatTile value={`${profile.heightCm} cm`} label={t('profile.heightLabel')} />}
              {bmiValue !== null && <StatTile value={bmiValue.toFixed(1)} label={t('profile.bmiLabel')} />}
            </StatRow>
          </div>
        )}
      </div>

      <section className="section">
        <div className="card card-pad">
          <WeightTrend checkins={checkins} />
        </div>
      </section>

      <section className="section">
        <button className="btn btn-tinted btn-block" onClick={() => setLoggingWeight(true)}>
          <PlusIcon />
          {t('profile.logWeight')}
        </button>
      </section>

      {checkins.length > 0 && (
        <section className="section">
          <div className="section-title">{t('profile.checkinsSection')}</div>
          <div className="card">
            {checkins.map((c, i) => (
              <CheckinRow key={c.id} checkin={c} previous={checkins[i + 1]} onDelete={() => setPendingDelete(c)} />
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
