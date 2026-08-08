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
  averageSessionMinutes,
  completedToday,
  currentWeekCount,
  dayKey,
  daysBetween,
  formatDate,
  formatDurationEstimate,
  greetingBucket,
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
import { daysAgoLabel, useLanguage, type TranslationKey } from '../data/i18n';
import type { Session, Training } from '../data/types';
import './HomePage.css';

/** A backup older than this is stale enough to nag about. */
const BACKUP_MAX_AGE_MS = 30 * 86_400_000;

const GREETING_KEYS: Record<ReturnType<typeof greetingBucket>, TranslationKey> = {
  morning: 'home.greetingMorning',
  day: 'home.greetingDay',
  evening: 'home.greetingEvening',
};

export function HomePage() {
  const {
    status,
    error,
    trainings,
    sessions,
    active,
    settings,
    profile,
    startSession,
    exportNow,
  } = useGym();

  const { t, locale } = useLanguage();
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
  const greetingText = t(GREETING_KEYS[greetingBucket(now)], {
    name: profile.name.trim() || t('home.greetingNamePlaceholder'),
  });
  const goal = settings.weeklyGoal;
  const weekCount = currentWeekCount(sessions, now);
  const streak = weeklyStreak(sessions, goal, now);
  const today = nextTraining(trainings, sessions);
  const doneToday = completedToday(sessions, now);
  const lastForToday = today ? lastSessionForTraining(today.id, sessions) : null;
  const durationEstimate = today ? averageSessionMinutes(today.id, sessions) : null;
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
      setToast(e instanceof Error ? e.message : t('common.couldNotStartSession'));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      await exportNow();
      setToast(t('common.backupDownloaded'));
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('common.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header home-header">
        <div>
          <h1 className="page-title">
            <button type="button" className="home-greeting" onClick={() => navigate('/profile')} aria-label={t('home.greetingAria')}>
              {greetingText}
            </button>
          </h1>
          <div className="page-sub">
            {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div className="home-header-actions">
          <button
            className="icon-btn"
            aria-label={theme === 'light' ? t('home.themeToDark') : t('home.themeToLight')}
            onClick={toggleTheme}
          >
            {theme === 'light' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="icon-btn" aria-label={t('settings.title')} onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
        </div>
      </header>

      {status === 'loading' && <div className="spinner" role="status" aria-label={t('common.loading')} />}

      {status === 'error' && (
        <div className="section">
          <div className="card card-pad home-error">
            <AlertIcon className="home-error-icon" />
            <div className="home-error-body">
              <div className="home-error-title">{t('home.errorTitle')}</div>
              <p className="home-error-text">{error ?? t('common.unknownError')}</p>
              <p className="home-error-text">{t('home.errorBody')}</p>
              <button className="btn btn-sm" onClick={() => window.location.reload()}>
                {t('common.reload')}
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
                  {t(weekCount === 1 ? 'home.weekCountOne' : 'home.weekCountOther', { count: weekCount })}
                </div>
                <div className="home-week-goal">
                  {t('home.goalPrefix')} <span className="num">{goal}</span> {t('home.goalSuffix')}
                </div>
                {streak > 0 && (
                  <div className="home-streak">
                    🔥 {t(streak === 1 ? 'home.streakWeekOne' : 'home.streakWeekOther', { count: streak })}
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
                  <span className="home-stats-title">{t('home.seeAllStats')}</span>
                  <span className="home-stats-sub">{t('home.seeAllStatsSub')}</span>
                </span>
                <ChevronRightIcon className="home-card-chevron" />
              </button>
            )}
          </section>

          {/* --- today's training ----------------------------------------- */}
          <section className="section">
            <div className="section-title">{t('home.todaySection')}</div>

            {doneToday && (
              <div className="home-done">
                <span className="pill pill-accent">{t('home.completedToday')}</span>
                <span className="home-done-label">{doneToday.trainingLabel}</span>
              </div>
            )}

            {active ? (
              <button
                className="card card-pad card-tappable home-card"
                onClick={() => navigate('/session')}
              >
                <div className="home-card-main">
                  <span className="pill pill-accent">{t('home.inProgress')}</span>
                  <div className="home-card-title">{active.trainingLabel}</div>
                  <div className="home-card-cta">{t('home.resumeSession')}</div>
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
                          {daysAgoLabel(t, daysBetween(new Date(lastForToday.startedAt), now))}
                        </span>
                      </>
                    ) : (
                      <span>{t('home.neverDone')}</span>
                    )}
                    {durationEstimate !== null && (
                      <>
                        <span className="home-card-dot">·</span>
                        <span>{t('home.usuallyDuration', { duration: formatDurationEstimate(durationEstimate) })}</span>
                      </>
                    )}
                  </div>
                  <div className="home-card-cta">
                    <PlayIcon className="home-card-cta-icon" />
                    {t('home.startSession')}
                  </div>
                </div>
                <ChevronRightIcon className="home-card-chevron" />
              </button>
            ) : (
              <div className="card card-pad">
                <div className="empty">{t('home.noTrainingsYet')}</div>
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 'var(--s3)' }}
                  onClick={() => navigate('/trainings')}
                >
                  {t('home.goToTrainings')}
                </button>
              </div>
            )}
          </section>

          {/* --- calendar --------------------------------------------------- */}
          {sessions.length > 0 && (
            <section className="section">
              <div className="section-title">{t('home.calendarSection')}</div>
              <HomeCalendar sessions={sessions} trainings={trainings} now={now} locale={locale} />
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
                      {lastExportAt ? t('home.backupOutdated') : t('home.backupFirst')}
                    </span>
                    <span className="home-banner-body">{t('home.backupBody')}</span>
                  </span>
                </button>
                <button
                  className="icon-btn home-banner-dismiss"
                  aria-label={t('home.dismissBackup')}
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
              <span className="num">{lifetime.totalSessions}</span>{' '}
              {t(lifetime.totalSessions === 1 ? 'common.sessionsOne' : 'common.sessionsOther')} ·{' '}
              <span className="num">{formatCompact(lifetime.totalVolumeKg)}</span> {t('home.lifetimeKgLifted')}
              {lifetime.since && <> {t('home.lifetimeSince', { date: formatDate(lifetime.since) })}</>}
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
  locale,
}: {
  sessions: Session[];
  trainings: Training[];
  now: Date;
  locale: string;
}) {
  const { t } = useLanguage();
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const trainingsById = useMemo(() => new Map(trainings.map((tr) => [tr.id, tr])), [trainings]);
  const grid = useMemo(() => monthGrid(month), [month]);

  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdays = grid.slice(0, 7).map(({ date }) => ({
    narrow: date.toLocaleDateString(locale, { weekday: 'narrow' }),
    full: date.toLocaleDateString(locale, { weekday: 'long' }),
  }));

  return (
    <div className="card card-pad home-cal">
      <div className="home-cal-head">
        <button
          className="icon-btn"
          aria-label={t('home.prevMonth')}
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeftIcon />
        </button>
        <div className="home-cal-title">{monthLabel}</div>
        <button
          className="icon-btn"
          aria-label={t('home.nextMonth')}
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
              aria-label={`${date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, ${session.trainingLabel}`}
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
