/**
 * History — reverse-chronological list of everything logged (SPEC §5.5).
 *
 * `sessions` and `sportSessions` arrive newest-first from the store and are
 * interleaved by `mergedHistory`; rows are grouped under month headings so a
 * long history stays scannable.
 */
import { useMemo } from 'react';
import { useGym } from '../data/store';
import { groupHistoryByMonth, mergedHistory, parseLocalDate, setCount, totalVolume, trainingBadge } from '../data/derive';
import { navigate } from '../router';
import { ChevronRightIcon } from '../components/icons';
import { formatDayTime, formatDayWithWeekday, formatMonthYear, useLanguage, type TFunc } from '../data/i18n';
import { sportSessionSummary } from '../data/sportLabels';
import type { Session, SportSession, Training } from '../data/types';
import './HistoryPage.css';

/** `12 sets · 1240 kg`, or just the sets for an all-bodyweight session. */
function sessionSummary(session: Session, t: TFunc): string {
  const sets = setCount(session);
  const volume = Math.round(totalVolume(session));
  const setsLabel = `${sets} ${t(sets === 1 ? 'common.setOne' : 'common.setsOther')}`;
  return volume > 0 ? `${setsLabel} · ${volume} kg` : setsLabel;
}

function HistoryRow({ id, badge, title, label, summary }: { id: string; badge: string; title: string; label: string; summary: string }) {
  return (
    <button className="history-row card-row" onClick={() => navigate(`/history/${id}`)} aria-label={`${label}, ${title}, ${summary}`}>
      <span className="history-row-badge" aria-hidden="true">
        {badge}
      </span>
      <span className="history-row-main">
        <span className="history-row-title">{label}</span>
        <span className="history-row-summary">
          {title} · {summary}
        </span>
      </span>
      <ChevronRightIcon className="history-row-chevron" />
    </button>
  );
}

function SessionRow({ session, training, now }: { session: Session; training: Training | undefined; now: Date }) {
  const { t, locale } = useLanguage();
  return (
    <HistoryRow
      id={session.id}
      badge={trainingBadge(training, session.trainingLabel)}
      title={formatDayTime(locale, session.startedAt, now)}
      label={session.trainingLabel}
      summary={sessionSummary(session, t)}
    />
  );
}

function SportHistoryRow({ session, training, now }: { session: SportSession; training: Training | undefined; now: Date }) {
  const { t, locale } = useLanguage();
  return (
    <HistoryRow
      id={session.id}
      badge={trainingBadge(training, session.trainingLabel)}
      title={formatDayWithWeekday(locale, parseLocalDate(session.date), now)}
      label={session.trainingLabel}
      summary={sportSessionSummary(t, session)}
    />
  );
}

export function HistoryPage() {
  const { sessions, sportSessions, trainings, status } = useGym();
  const { t, locale } = useLanguage();
  const items = useMemo(() => mergedHistory(sessions, sportSessions), [sessions, sportSessions]);
  const groups = useMemo(() => groupHistoryByMonth(items), [items]);
  const trainingsById = useMemo(() => new Map(trainings.map((tr) => [tr.id, tr])), [trainings]);
  const total = items.length;
  const now = new Date();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('tabbar.history')}</h1>
        {total > 0 && (
          <div className="page-sub">
            {total} {t(total === 1 ? 'common.sessionsOne' : 'common.sessionsOther')}
          </div>
        )}
      </div>

      {status === 'loading' && <div className="spinner" />}

      {status !== 'loading' && total === 0 && <div className="empty">{t('history.emptyState')}</div>}

      {groups.map((group) => (
        <section className="section" key={group.key}>
          <h2 className="section-title history-month">{formatMonthYear(locale, group.anchor)}</h2>
          <div className="card">
            {group.items.map((item) =>
              item.kind === 'gym' ? (
                <SessionRow session={item.session} training={trainingsById.get(item.session.trainingId)} now={now} key={item.session.id} />
              ) : (
                <SportHistoryRow
                  session={item.sportSession}
                  training={trainingsById.get(item.sportSession.trainingId)}
                  now={now}
                  key={item.sportSession.id}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
