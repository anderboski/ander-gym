/**
 * Weekly recap — SPEC §5.1. A sheet shown on the first launch of a new week,
 * summarising the week before: activities per training, active days, and the
 * personal records beaten.
 */
import { useEffect, useState } from 'react';
import { dayKey, recapWeekDue, weeklyRecap, type WeeklyRecap } from '../data/derive';
import { exerciseDisplayName } from '../data/exerciseI18n';
import { formatDay, useLanguage } from '../data/i18n';
import { formatSet } from '../data/parse';
import { getLastRecapWeek, setLastRecapWeek } from '../data/recap';
import { trainingKindLabel } from '../data/sportLabels';
import { useGym } from '../data/store';
import { ExerciseThumb } from './ExerciseThumb';
import { TrophyIcon } from './icons';
import { Sheet } from './Sheet';
import { StatRow, StatTile } from './StatTile';
import './WeeklyRecap.css';

/**
 * Mounted at the app root, behind the "What's new" queue so two sheets never
 * stack. Decides once, the first time the store is ready, whether a recap is
 * due — deciding on every state change would let an import or a session
 * logged mid-week conjure a recap the launch didn't owe.
 */
export function WeeklyRecapGate() {
  const { status, sessions, sportSessions, trainings } = useGym();
  // undefined = not decided yet; null = nothing to show.
  const [recap, setRecap] = useState<WeeklyRecap | null | undefined>(undefined);

  useEffect(() => {
    if (status !== 'ready' || recap !== undefined) return;
    const week = recapWeekDue(getLastRecapWeek(), new Date(), sessions, sportSessions);
    setRecap(week ? weeklyRecap(sessions, sportSessions, trainings, week) : null);
  }, [status, recap, sessions, sportSessions, trainings]);

  if (!recap) return null;

  function dismiss() {
    setLastRecapWeek(dayKey(recap!.weekStart));
    setRecap(null);
  }

  return <WeeklyRecapSheet recap={recap} onClose={dismiss} />;
}

function WeeklyRecapSheet({ recap, onClose }: { recap: WeeklyRecap; onClose: () => void }) {
  const { getExercise } = useGym();
  const { language, locale, t } = useLanguage();
  const range = `${formatDay(locale, recap.weekStart)} – ${formatDay(locale, recap.weekEnd)}`;

  return (
    <Sheet
      title={t('recap.title')}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" onClick={onClose}>
          {t('recap.done')}
        </button>
      }
    >
      <div className="recap">
        <p className="recap-range">{range}</p>

        {recap.activities === 0 ? (
          <p className="recap-empty">{t('recap.empty')}</p>
        ) : (
          <>
            <StatRow>
              <StatTile value={String(recap.activities)} label={t('recap.activities')} />
              <StatTile value={String(recap.activeDays)} label={t('recap.activeDays')} />
              <StatTile value={String(recap.records.length)} label={t('recap.records')} />
            </StatRow>

            <section className="recap-section">
              <h3 className="recap-section-title">{t('recap.byTraining')}</h3>
              <div className="recap-list">
                {recap.byTraining.map((row) => (
                  <div key={row.trainingId} className="recap-row">
                    <span className="recap-badge" aria-hidden="true">
                      {row.badge}
                    </span>
                    <span className="recap-text">
                      <span className="recap-label">{row.label}</span>
                      <span className="recap-sub">{trainingKindLabel(t, row.kind)}</span>
                    </span>
                    <span className="recap-count num">×{row.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {recap.records.length > 0 && (
              <section className="recap-section">
                <h3 className="recap-section-title">{t('recap.newRecords')}</h3>
                <div className="recap-list">
                  {recap.records.map((rec) => {
                    const exercise = getExercise(rec.exerciseId);
                    const name = exercise ? exerciseDisplayName(language, exercise.name) : t('common.unknown');
                    return (
                      <div key={rec.exerciseId} className="recap-row">
                        <ExerciseThumb exercise={exercise} name={name} className="recap-thumb" />
                        <span className="recap-text">
                          <span className="recap-label">{name}</span>
                          <span className="recap-sub">
                            {rec.type === 'heaviest'
                              ? t('recap.recordHeaviest')
                              : t('recap.recordReps', { reps: rec.set.reps })}
                          </span>
                        </span>
                        <span className="pill pill-accent num">
                          <TrophyIcon />
                          {formatSet(rec.set.reps, rec.set.weight)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
