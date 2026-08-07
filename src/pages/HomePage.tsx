/**
 * Home — SPEC §5.1.
 *
 * The first screen the app shows, so unlike every other page it cannot assume
 * the store is loaded: it renders loading and error states itself.
 *
 * All maths comes from data/derive.ts. `now` is captured once per render so the
 * week counter, streak and "days ago" lines can never disagree with each other.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  addMonths,
  completedToday,
  currentWeekCount,
  dayKey,
  daysBetween,
  formatDate,
  formatDaysAgo,
  isSameDay,
  lastSessionForTraining,
  lifetimeStats,
  monthGrid,
  nextTraining,
  sessionsByDay,
  startOfMonth,
  weeklyStreak,
} from '../data/derive';
import { formatCompact } from '../data/parse';
import { navigate } from '../router';
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  GearIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
} from '../components/icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { Toast } from '../components/Sheet';
import { getTheme, otherTheme, setTheme, type Theme } from '../data/theme';
import type { Session, Training } from '../data/types';
import './HomePage.css';

/** A backup older than this is stale enough to nag about. */
const BACKUP_MAX_AGE_MS = 30 * 86_400_000;

export function HomePage() {
  const {
    status,
    error,
    trainings,
    sessions,
    active,
    settings,
    startSession,
    exportNow,
  } = useGym();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  function toggleTheme() {
    const next = otherTheme(theme);
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const now = new Date();
  const goal = settings.weeklyGoal;
  const weekCount = currentWeekCount(sessions, now);
  const streak = weeklyStreak(sessions, goal, now);
  const today = nextTraining(trainings, sessions);
  const doneToday = completedToday(sessions, now);
  const lastForToday = today ? lastSessionForTraining(today.id, sessions) : null;
  const lifetime = lifetimeStats(sessions);

  const lastExportAt = settings.lastExportAt;
  const exportAge = lastExportAt ? now.getTime() - new Date(lastExportAt).getTime() : null;
  const backupDue =
    (lastExportAt === null && sessions.length > 0) ||
    (exportAge !== null && exportAge > BACKUP_MAX_AGE_MS);

  async function handleStart(trainingId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await startSession(trainingId);
      navigate('/session');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not start the session.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      await exportNow();
      setToast('Backup downloaded.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header home-header">
        <div>
          <h1 className="page-title">Home</h1>
          <div className="page-sub">
            {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div className="home-header-actions">
          <button
            className="icon-btn"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            onClick={toggleTheme}
          >
            {theme === 'light' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
        </div>
      </header>

      {status === 'loading' && <div className="spinner" role="status" aria-label="Loading" />}

      {status === 'error' && (
        <div className="section">
          <div className="card card-pad home-error">
            <AlertIcon className="home-error-icon" />
            <div className="home-error-body">
              <div className="home-error-title">Couldn’t load your data</div>
              <p className="home-error-text">{error ?? 'Unknown error.'}</p>
              <p className="home-error-text">
                Your data is still on the device. Reload to try again.
              </p>
              <button className="btn btn-sm" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* --- week counter + streak ------------------------------------ */}
          <section className="section">
            <div className="card card-pad home-week">
              <GoalRing count={weekCount} goal={goal} />
              <div className="home-week-text">
                <div className="home-week-count">
                  {weekCount} training{weekCount === 1 ? '' : 's'} this week
                </div>
                <div className="home-week-goal">
                  Goal <span className="num">{goal}</span> per week
                </div>
                {streak > 0 && (
                  <div className="home-streak">
                    🔥 {streak} week{streak === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>

            {/* The week counter's push view (§5.6). Hidden until there is
                history, so a fresh install keeps its empty state. */}
            {sessions.length > 0 && (
              <button
                className="card card-pad card-tappable home-stats"
                onClick={() => navigate('/stats')}
              >
                <span className="home-stats-text">
                  <span className="home-stats-title">See all stats</span>
                  <span className="home-stats-sub">Volume, consistency and muscle balance</span>
                </span>
                <ChevronRightIcon className="home-card-chevron" />
              </button>
            )}
          </section>

          {/* --- today's training ----------------------------------------- */}
          <section className="section">
            <div className="section-title">Today</div>

            {doneToday && (
              <div className="home-done">
                <span className="pill pill-accent">Completed today</span>
                <span className="home-done-label">{doneToday.trainingLabel}</span>
              </div>
            )}

            {active ? (
              <button
                className="card card-pad card-tappable home-card"
                onClick={() => navigate('/session')}
              >
                <div className="home-card-main">
                  <span className="pill pill-accent">In progress</span>
                  <div className="home-card-title">{active.trainingLabel}</div>
                  <div className="home-card-cta">Resume session</div>
                </div>
                <ChevronRightIcon className="home-card-chevron" />
              </button>
            ) : today ? (
              <button
                className="card card-pad card-tappable home-card"
                disabled={busy}
                onClick={() => void handleStart(today.id)}
              >
                <div className="home-card-main">
                  <div className="home-card-title">{today.label}</div>
                  <div className="home-card-last">
                    {lastForToday ? (
                      <>
                        <span className="num">{formatDate(lastForToday.startedAt)}</span>
                        <span className="home-card-dot">·</span>
                        <span>
                          {formatDaysAgo(daysBetween(new Date(lastForToday.startedAt), now))}
                        </span>
                      </>
                    ) : (
                      <span>Never done</span>
                    )}
                  </div>
                  <div className="home-card-cta">
                    <PlayIcon className="home-card-cta-icon" />
                    Start session
                  </div>
                </div>
                <ChevronRightIcon className="home-card-chevron" />
              </button>
            ) : (
              <div className="card card-pad">
                <div className="empty">No training days yet — add one from the Trainings tab.</div>
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 'var(--s3)' }}
                  onClick={() => navigate('/trainings')}
                >
                  Go to Trainings
                </button>
              </div>
            )}
          </section>

          {/* --- calendar --------------------------------------------------- */}
          {sessions.length > 0 && (
            <section className="section">
              <div className="section-title">Calendar</div>
              <HomeCalendar sessions={sessions} trainings={trainings} now={now} />
            </section>
          )}

          {/* --- backup reminder ------------------------------------------ */}
          {backupDue && !bannerDismissed && (
            <section className="section">
              <div className="home-banner">
                <button
                  className="home-banner-main"
                  disabled={busy}
                  onClick={() => void handleExport()}
                >
                  <AlertIcon className="home-banner-icon" />
                  <span className="home-banner-text">
                    <span className="home-banner-title">
                      {lastExportAt ? 'Your backup is out of date' : 'Back up your data'}
                    </span>
                    <span className="home-banner-body">
                      Everything lives only on this iPhone and there is no server copy — Safari can
                      evict it at any time. Tap to download a backup file.
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn home-banner-dismiss"
                  aria-label="Dismiss backup reminder"
                  onClick={() => setBannerDismissed(true)}
                >
                  <CloseIcon />
                </button>
              </div>
            </section>
          )}

          {/* --- lifetime stats footer -------------------------------------- */}
          {lifetime.totalSessions > 0 && (
            <div className="section home-lifetime">
              <span className="num">{lifetime.totalSessions}</span> session
              {lifetime.totalSessions === 1 ? '' : 's'} ·{' '}
              <span className="num">{formatCompact(lifetime.totalVolumeKg)}</span> kg lifted
              {lifetime.since && <> since {formatDate(lifetime.since)}</>}
            </div>
          )}
        </>
      )}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {toast && <Toast message={toast} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Progress ring against the weekly goal. Decorative: the "N trainings this
 * week" line beside it is the accessible equivalent, so the SVG is hidden.
 */
function GoalRing({ count, goal }: { count: number; goal: number }) {
  const fraction = goal > 0 ? Math.min(1, count / goal) : 0;

  return (
    <svg className="ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <circle className="ring-track" cx="36" cy="36" r={RING_R} />
      <circle
        className="ring-fill"
        cx="36"
        cy="36"
        r={RING_R}
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - fraction)}
      />
      <text className="ring-value" x="36" y="36" dominantBaseline="central" textAnchor="middle">
        {count}
      </text>
    </svg>
  );
}

/**
 * Month calendar: one training per day at most (the later one wins on a
 * multi-session day, per `sessionsByDay`). Tapping a trained day opens that
 * session in History; the month in view is local state, independent of `now`.
 */
function HomeCalendar({
  sessions,
  trainings,
  now,
}: {
  sessions: Session[];
  trainings: Training[];
  now: Date;
}) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const trainingsById = useMemo(() => new Map(trainings.map((t) => [t.id, t])), [trainings]);
  const grid = useMemo(() => monthGrid(month), [month]);

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekdays = grid.slice(0, 7).map(({ date }) => ({
    narrow: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
    full: date.toLocaleDateString(undefined, { weekday: 'long' }),
  }));

  return (
    <div className="card card-pad home-cal">
      <div className="home-cal-head">
        <button
          className="icon-btn"
          aria-label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeftIcon />
        </button>
        <div className="home-cal-title">{monthLabel}</div>
        <button
          className="icon-btn"
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="home-cal-weekdays">
        {weekdays.map((w, i) => (
          <div className="home-cal-weekday" key={i} aria-label={w.full}>
            {w.narrow}
          </div>
        ))}
      </div>

      <div className="home-cal-grid">
        {grid.map(({ date, inMonth }) => {
          const session = byDay.get(dayKey(date));
          const classes = ['home-cal-day'];
          if (!inMonth) classes.push('home-cal-day-out');
          if (isSameDay(date, now)) classes.push('home-cal-day-today');

          if (!session) {
            return (
              <div className={classes.join(' ')} key={date.toISOString()}>
                <span className="home-cal-daynum">{date.getDate()}</span>
              </div>
            );
          }

          classes.push('home-cal-day-trained');
          return (
            <button
              type="button"
              className={classes.join(' ')}
              key={date.toISOString()}
              onClick={() => navigate(`/history/${session.id}`)}
              aria-label={`${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${session.trainingLabel}`}
            >
              <span className="home-cal-daynum">{date.getDate()}</span>
              <span className="home-cal-dot" aria-hidden="true">
                {trainingsById.get(session.trainingId)?.emoji ??
                  session.trainingLabel.charAt(0).toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
