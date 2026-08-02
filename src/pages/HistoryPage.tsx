/**
 * History — reverse-chronological list of saved sessions (SPEC §5.5).
 *
 * `sessions` arrives newest-first from the store; rows are grouped under month
 * headings so a long history stays scannable without any extra sorting.
 */
import { useMemo } from 'react';
import { useGym } from '../data/store';
import { formatDateTime, setCount, totalVolume } from '../data/derive';
import { navigate } from '../router';
import { ChevronRightIcon } from '../components/icons';
import type { Session } from '../data/types';
import './HistoryPage.css';

/** `12 sets · 1240 kg`, or just the sets for an all-bodyweight session. */
export function sessionSummary(session: Session): string {
  const sets = setCount(session);
  const volume = Math.round(totalVolume(session));
  const setsLabel = `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  return volume > 0 ? `${setsLabel} · ${volume} kg` : setsLabel;
}

type MonthGroup = { key: string; label: string; sessions: Session[] };

/** `August 2026`, in the device locale. */
function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Split an already-sorted list into consecutive month runs. Because the input
 * is newest-first, a simple run-length pass is enough — no map, no re-sort.
 */
function groupByMonth(sessions: Session[]): MonthGroup[] {
  const groups: MonthGroup[] = [];

  for (const session of sessions) {
    const d = new Date(session.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length - 1];

    if (last && last.key === key) last.sessions.push(session);
    else groups.push({ key, label: monthLabel(d), sessions: [session] });
  }
  return groups;
}

function SessionRow({ session }: { session: Session }) {
  return (
    <button
      className="card card-tappable history-row"
      onClick={() => navigate(`/history/${session.id}`)}
      aria-label={`${session.trainingLabel}, ${formatDateTime(session.startedAt)}, ${sessionSummary(session)}`}
    >
      <span className="history-row-main">
        <span className="history-row-date num">{formatDateTime(session.startedAt)}</span>
        <span className="history-row-training">{session.trainingLabel}</span>
        <span className="history-row-summary">{sessionSummary(session)}</span>
      </span>
      <span className="history-row-chevron" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

export function HistoryPage() {
  const { sessions, status } = useGym();
  const groups = useMemo(() => groupByMonth(sessions), [sessions]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">History</h1>
        {sessions.length > 0 && (
          <div className="page-sub">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </div>
        )}
      </div>

      {status === 'loading' && <div className="spinner" />}

      {status !== 'loading' && sessions.length === 0 && (
        <div className="empty">No sessions yet — start one from Home.</div>
      )}

      {groups.map((group) => (
        <section className="section" key={group.key}>
          <h2 className="section-title">{group.label}</h2>
          <div className="history-list">
            {group.sessions.map((session) => (
              <SessionRow session={session} key={session.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
