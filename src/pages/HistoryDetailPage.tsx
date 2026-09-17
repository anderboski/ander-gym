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
import { formatElapsed, parseLocalDate, setCount, totalVolume } from '../data/derive';
import { formatWeight } from '../data/parse';
import { navigate } from '../router';
import { BackButton } from '../components/BackButton';
import { SetMatrix } from '../components/ExerciseCard';
import { ExerciseThumb } from '../components/ExerciseThumb';
import { ConfirmSheet } from '../components/Sheet';
import { StatRow, StatTile } from '../components/StatTile';
import { formatDayTime, formatDayWithWeekday, useLanguage } from '../data/i18n';
import { exerciseDisplayName } from '../data/exerciseI18n';
import { snowConditionLabel, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import { CLIMB_GRADES, type Exercise, type Session, type SessionEntry, type SportSession } from '../data/types';
import './HistoryPage.css';

/**
 * One logged exercise. Names and images are resolved at render time from the
 * catalogue — a session only ever snapshots ids — so an exercise removed by an
 * import falls back to its raw id rather than rendering blank.
 */
function EntryRow({ entry, exercise }: { entry: SessionEntry; exercise: Exercise | undefined }) {
  const { t, language } = useLanguage();
  const name = exercise ? exerciseDisplayName(language, exercise.name) : entry.exerciseId;
  const logged = entry.sets.length > 0;

  return (
    <div className={logged ? 'history-entry card-row' : 'history-entry card-row history-entry-empty'}>
      <ExerciseThumb exercise={exercise} name={name} />
      <div className="history-entry-body">
        <div className="history-entry-name">{name}</div>
        {logged ? <SetMatrix sets={entry.sets} /> : <div className="history-entry-none">{t('historyDetail.notLogged')}</div>}
      </div>
    </div>
  );
}

function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <div className="page-header">
        <BackButton to="/history" label={t('tabbar.history')} ariaLabel={t('historyDetail.backAria')} />
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

/** The shared frame: back, title, subtitle, tiles, then the kind-specific body and the delete action. */
function DetailShell({
  title,
  subtitle,
  tiles,
  deleteLabel,
  onDelete,
  children,
}: {
  title: string;
  subtitle: string;
  tiles?: React.ReactNode;
  deleteLabel: string;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="page">
      <div className="page-header history-detail-header">
        <BackButton to="/history" label={t('tabbar.history')} ariaLabel={t('historyDetail.backAria')} />
        <h1 className="page-title">{title}</h1>
        <div className="page-sub">{subtitle}</div>
        {tiles && <StatRow>{tiles}</StatRow>}
      </div>

      {children}

      <section className="section history-detail-danger">
        <button className="btn btn-danger btn-block" onClick={onDelete}>
          {deleteLabel}
        </button>
      </section>
    </div>
  );
}

function SessionDetail({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  const { getExercise, deleteSession } = useGym();
  const { t, locale } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  const sets = setCount(session);
  const volume = Math.round(totalVolume(session));
  const when = formatDayTime(locale, session.startedAt);

  async function onDelete() {
    setConfirming(false);
    // Flagged before the store update lands, so the parent shows a spinner
    // instead of flashing "Session not found" between delete and navigation.
    onDeleted();
    await deleteSession(session.id);
    navigate('/history');
  }

  return (
    <>
      <DetailShell
        title={session.trainingLabel}
        subtitle={when}
        tiles={
          <>
            <StatTile value={String(sets)} label={t(sets === 1 ? 'common.setOne' : 'common.setsOther')} />
            <StatTile value={volume > 0 ? `${formatWeight(volume)} kg` : '—'} label={t('historyDetail.volumeLabel')} />
            <StatTile value={formatElapsed(session.startedAt, new Date(session.savedAt))} label={t('historyDetail.durationLabel')} />
          </>
        }
        deleteLabel={t('historyDetail.deleteSessionButton')}
        onDelete={() => setConfirming(true)}
      >
        <section className="section">
          <h2 className="section-title">{t('tabbar.exercises')}</h2>
          {session.entries.length === 0 ? (
            <div className="empty">{t('historyDetail.noExercises')}</div>
          ) : (
            <div className="card">
              {session.entries.map((entry, i) => (
                <EntryRow key={`${entry.exerciseId}-${i}`} entry={entry} exercise={getExercise(entry.exerciseId)} />
              ))}
            </div>
          )}
        </section>
      </DetailShell>

      {confirming && (
        <ConfirmSheet
          title={t('historyDetail.deleteSessionTitle')}
          message={t(sets === 1 ? 'historyDetail.deleteMessageOne' : 'historyDetail.deleteMessageOther', { date: when, count: sets })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/**
 * A logged sport session, read-only — same "no editing, only delete" rule as
 * a gym session (D7), plus each kind's summary stats as the tile row a gym
 * session shows sets/volume/duration in.
 */
function SportSessionDetail({ session, onDeleted }: { session: SportSession; onDeleted: () => void }) {
  const { deleteSportSession } = useGym();
  const { t, locale } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const when = formatDayWithWeekday(locale, parseLocalDate(session.date));

  async function onDelete() {
    setConfirming(false);
    onDeleted();
    await deleteSportSession(session.id);
    navigate('/history');
  }

  // An 'other' log has no measurements at all, so it gets no tile row —
  // an empty one would leave a gap under the header.
  const tiles =
    session.kind === 'snowboard' ? (
      <>
        <StatTile value={weatherLabel(t, session.weather)} label={t('sportLog.weatherLabel')} />
        <StatTile value={snowConditionLabel(t, session.snowCondition)} label={t('sportLog.snowLabel')} />
      </>
    ) : session.kind === 'cycling' ? (
      <>
        <StatTile value={`${session.distanceKm.toFixed(1)} km`} label={t('sportLog.distanceLabel')} />
        <StatTile value={`${Math.round(session.elevationM)} m`} label={t('sportLog.elevationLabel')} />
        {session.avgBpm !== null && <StatTile value={`${Math.round(session.avgBpm)}`} label={t('sportLog.bpmLabel')} />}
      </>
    ) : session.kind === 'climbing' ? (
      <>
        {CLIMB_GRADES.map((grade) => (
          <StatTile key={grade} value={String(session.climbsByGrade[grade])} label={t('stats.climbGradeLabel', { grade })} />
        ))}
      </>
    ) : undefined;

  return (
    <>
      <DetailShell
        title={session.trainingLabel}
        subtitle={`${when} · ${trainingKindLabel(t, session.kind)}`}
        tiles={tiles}
        deleteLabel={t('sportLog.deleteLogButton')}
        onDelete={() => setConfirming(true)}
      >
        {(session.kind === 'snowboard' || session.kind === 'other') && session.comments && (
          <section className="section">
            <h2 className="section-title">{t('sportLog.commentsLabel')}</h2>
            <p className="card card-pad history-comments">{session.comments}</p>
          </section>
        )}
      </DetailShell>

      {confirming && (
        <ConfirmSheet
          title={t('sportLog.deleteLogTitle')}
          message={t('sportLog.deleteLogMessage', { date: when })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
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
