/**
 * A saved session, read-only (SPEC §5.5, decision D7).
 *
 * The layout mirrors the active-session table, minus every control that could
 * mutate it: no "+", no set deletion. The only write available is deleting the
 * whole session, which is confirmed first. Everything downstream (Home's
 * counters, each card's latest-training data) recomputes from `sessions`, so
 * deletion needs no extra bookkeeping here.
 */
import { useState } from 'react';
import { useGym } from '../data/store';
import { formatDateTime, formatElapsed, formatShortLocalDate, setCount, totalVolume } from '../data/derive';
import { formatWeight } from '../data/parse';
import { navigate } from '../router';
import { SetMatrix } from '../components/ExerciseCard';
import { ConfirmSheet } from '../components/Sheet';
import { ChevronLeftIcon } from '../components/icons';
import { useLanguage } from '../data/i18n';
import { translateExerciseName } from '../data/exerciseI18n';
import { snowConditionLabel, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import { CLIMB_GRADES, type Exercise, type Session, type SessionEntry, type SportSession } from '../data/types';
import './HistoryPage.css';

function BackButton() {
  const { t } = useLanguage();

  return (
    <button className="history-back" onClick={() => navigate('/history')} aria-label={t('historyDetail.backAria')}>
      <ChevronLeftIcon />
      <span>{t('tabbar.history')}</span>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="history-stat">
      <div className="history-stat-value num">{value}</div>
      <div className="history-stat-label">{label}</div>
    </div>
  );
}

/**
 * One logged exercise. Names and images are resolved at render time from the
 * catalogue — a session only ever snapshots ids — so an exercise removed by an
 * import falls back to its raw id rather than rendering blank.
 */
function EntryRow({ entry, exercise }: { entry: SessionEntry; exercise: Exercise | undefined }) {
  const { t, language } = useLanguage();
  const name = exercise ? translateExerciseName(language, exercise.name) : entry.exerciseId;
  const logged = entry.sets.length > 0;

  return (
    <div className={logged ? 'card history-entry' : 'card history-entry history-entry-empty'}>
      <div className="history-entry-thumb">
        {exercise?.imageUrl ? (
          <img
            src={exercise.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            // Images are cached lazily by the SW; a miss while offline should
            // leave the tile blank, not break the row.
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="history-entry-letter">{name.charAt(0).toUpperCase()}</div>
        )}
      </div>

      <div className="history-entry-body">
        <div className="history-entry-name">{name}</div>
        {logged ? (
          <SetMatrix sets={entry.sets} />
        ) : (
          <div className="history-entry-none">{t('historyDetail.notLogged')}</div>
        )}
      </div>
    </div>
  );
}

function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <div className="page-header">
        <BackButton />
        <h1 className="page-title">{t('historyDetail.notFoundTitle')}</h1>
        <div className="page-sub">{t('historyDetail.notFoundBody')}</div>
      </div>
      <div className="section">
        <button className="btn btn-primary btn-block" onClick={() => navigate('/history')}>
          {t('historyDetail.backToHistory')}
        </button>
      </div>
    </div>
  );
}

function SessionDetail({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  const { getExercise, deleteSession } = useGym();
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  const sets = setCount(session);
  const volume = Math.round(totalVolume(session));

  async function onDelete() {
    setConfirming(false);
    // Flagged before the store update lands, so the parent shows a spinner
    // instead of flashing "Session not found" between delete and navigation.
    onDeleted();
    await deleteSession(session.id);
    navigate('/history');
  }

  return (
    <div className="page">
      <div className="page-header history-detail-header">
        <BackButton />
        <h1 className="page-title num">{formatDateTime(session.startedAt)}</h1>
        <div className="page-sub">{session.trainingLabel}</div>

        <div className="history-stats">
          <Stat value={String(sets)} label={t(sets === 1 ? 'common.setOne' : 'common.setsOther')} />
          <Stat value={volume > 0 ? `${formatWeight(volume)} kg` : '—'} label={t('historyDetail.volumeLabel')} />
          <Stat
            value={formatElapsed(session.startedAt, new Date(session.savedAt))}
            label={t('historyDetail.durationLabel')}
          />
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">{t('tabbar.exercises')}</h2>
        {session.entries.length === 0 ? (
          <div className="empty">{t('historyDetail.noExercises')}</div>
        ) : (
          <div className="history-entries">
            {session.entries.map((entry, i) => (
              <EntryRow
                key={`${entry.exerciseId}-${i}`}
                entry={entry}
                exercise={getExercise(entry.exerciseId)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section history-detail-danger">
        <button className="btn btn-danger btn-block" onClick={() => setConfirming(true)}>
          {t('historyDetail.deleteSessionButton')}
        </button>
      </section>

      {confirming && (
        <ConfirmSheet
          title={t('historyDetail.deleteSessionTitle')}
          message={t(sets === 1 ? 'historyDetail.deleteMessageOne' : 'historyDetail.deleteMessageOther', {
            date: formatDateTime(session.startedAt),
            count: sets,
          })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/**
 * A logged sport session, read-only — same "no editing, only delete" rule as
 * a gym session (D7), plus each kind's summary stats as the tile row a gym
 * session shows sets/volume/duration in.
 */
function SportSessionDetail({ session, onDeleted }: { session: SportSession; onDeleted: () => void }) {
  const { deleteSportSession } = useGym();
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  async function onDelete() {
    setConfirming(false);
    onDeleted();
    await deleteSportSession(session.id);
    navigate('/history');
  }

  return (
    <div className="page">
      <div className="page-header history-detail-header">
        <BackButton />
        <h1 className="page-title num">{formatShortLocalDate(session.date)}</h1>
        <div className="page-sub">
          {session.trainingLabel} · {trainingKindLabel(t, session.kind)}
        </div>

        <div className="history-stats">
          {session.kind === 'snowboard' && (
            <>
              <Stat value={weatherLabel(t, session.weather)} label={t('sportLog.weatherLabel')} />
              <Stat value={snowConditionLabel(t, session.snowCondition)} label={t('sportLog.snowLabel')} />
            </>
          )}
          {session.kind === 'cycling' && (
            <>
              <Stat value={`${session.distanceKm.toFixed(1)} km`} label={t('sportLog.distanceLabel')} />
              <Stat value={`${Math.round(session.elevationM)} m`} label={t('sportLog.elevationLabel')} />
              {session.avgBpm !== null && (
                <Stat value={`${Math.round(session.avgBpm)}`} label={t('sportLog.bpmLabel')} />
              )}
            </>
          )}
          {session.kind === 'climbing' &&
            CLIMB_GRADES.map((grade) => (
              <Stat key={grade} value={String(session.climbsByGrade[grade])} label={grade} />
            ))}
        </div>
      </div>

      {session.kind === 'snowboard' && session.comments && (
        <section className="section">
          <h2 className="section-title">{t('sportLog.commentsLabel')}</h2>
          <p className="card card-pad">{session.comments}</p>
        </section>
      )}

      <section className="section history-detail-danger">
        <button className="btn btn-danger btn-block" onClick={() => setConfirming(true)}>
          {t('sportLog.deleteLogButton')}
        </button>
      </section>

      {confirming && (
        <ConfirmSheet
          title={t('sportLog.deleteLogTitle')}
          message={t('sportLog.deleteLogMessage', { date: formatShortLocalDate(session.date) })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function HistoryDetailPage({ sessionId }: { sessionId: string }) {
  const { sessions, sportSessions, status } = useGym();
  const [deleting, setDeleting] = useState(false);

  // While the catalogue is still loading `sessions` is empty — that is not the
  // same as a missing session, so don't accuse the user of a bad link yet.
  if (status === 'loading' || deleting) {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  const session = sessions.find((s) => s.id === sessionId);
  if (session) return <SessionDetail session={session} onDeleted={() => setDeleting(true)} />;

  const sportSession = sportSessions.find((s) => s.id === sessionId);
  if (sportSession) return <SportSessionDetail session={sportSession} onDeleted={() => setDeleting(true)} />;

  return <NotFound />;
}
