/**
 * Home — SPEC §5.1.
 *
 * The first screen the app shows, so unlike every other page it cannot assume
 * the store is loaded: it renders loading and error states itself.
 *
 * All maths comes from data/derive.ts. `now` is captured once per render so the
 * week counter, streak and "days ago" lines can never disagree with each other.
 */
import { useEffect, useState } from 'react';
import { useGym } from '../data/store';
import {
  completedToday,
  currentWeekCount,
  daysBetween,
  formatDate,
  formatDaysAgo,
  lastSessionForTraining,
  nextTraining,
  weeklyStreak,
} from '../data/derive';
import { bodyPartsLabel } from '../data/parse';
import { navigate } from '../router';
import { AlertIcon, ChevronRightIcon, CloseIcon, GearIcon, PlayIcon } from '../components/icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { Toast } from '../components/Sheet';
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
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <GearIcon />
        </button>
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
                  <div className="home-card-parts">{bodyPartsLabel(active.trainingLabel)}</div>
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
                  <div className="home-card-parts">{bodyPartsLabel(today.label)}</div>
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
                <div className="empty">
                  No training days yet — they are seeded from data/training_days.txt.
                </div>
              </div>
            )}
          </section>

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
