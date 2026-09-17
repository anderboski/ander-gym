/**
 * Home — SPEC §5.1.
 *
 * The first screen the app shows, so unlike every other page it cannot assume
 * the store is loaded: it renders loading and error states itself.
 *
 * All maths comes from data/derive.ts. `now` is captured once per render so the
 * week counter, streak and "days ago" lines can never disagree with each other.
 */
import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  addMonths,
  averageSessionMinutes,
  backupStatus,
  completedToday,
  currentWeekCount,
  dayKey,
  daysBetween,
  formatDurationEstimate,
  greetingBucket,
  isSameDay,
  lastSessionForTraining,
  lifetimeStats,
  monthGrid,
  nextTraining,
  sessionsByDay,
  sportSessionsByDay,
  startOfMonth,
  trainingBadge,
  weeklyStreak,
} from '../data/derive';
import { formatCompact } from '../data/parse';
import type { ExportOutcome } from '../data/backup';
import { navigate } from '../router';
import {
  AlertIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FlameIcon,
  GearIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
  UserIcon,
} from '../components/icons';
import { SettingsSheet } from '../components/SettingsSheet';
import { Toast } from '../components/Sheet';
import { useTransient } from '../hooks/useTransient';
import { getTheme, otherTheme, setTheme, type Theme } from '../data/theme';
import { daysAgoLabel, formatDay, formatLongDate, formatMonthYear, useLanguage, type TranslationKey } from '../data/i18n';
import type { Session, SportSession, Training } from '../data/types';
import './HomePage.css';

const GREETING_KEYS: Record<ReturnType<typeof greetingBucket>, TranslationKey> = {
  morning: 'home.greetingMorning',
  day: 'home.greetingDay',
  evening: 'home.greetingEvening',
};

/**
 * What to tell the user after an export. A share sheet may have put the file
 * in iCloud Drive, in Mail, anywhere — "downloaded" would be wrong, and a
 * cancelled share gets no toast at all (handled by the caller).
 */
const EXPORT_TOAST_KEY: Record<Exclude<ExportOutcome, 'cancelled'>, TranslationKey> = {
  shared: 'common.backupShared',
  downloaded: 'common.backupDownloaded',
};

/** Up to two initials from a name — "Ander Sainz" → "AS". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function HomePage() {
  const { status, error, trainings, sessions, sportSessions, active, settings, profile, startSession, exportNow } =
    useGym();

  const { t, locale } = useLanguage();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useTransient<string>(3200);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  function toggleTheme() {
    const next = otherTheme(theme);
    setTheme(next);
    setThemeState(next);
  }

  const now = new Date();
  const name = profile.name.trim();
  const greeting = t(GREETING_KEYS[greetingBucket(now)]);
  const goal = settings.weeklyGoal;
  const weekCount = currentWeekCount(sessions, now);
  const streak = weeklyStreak(sessions, goal, now);
  const today = nextTraining(trainings, sessions);
  const doneToday = completedToday(sessions, now);
  const lastForToday = today ? lastSessionForTraining(today.id, sessions) : null;
  const durationEstimate = today ? averageSessionMinutes(today.id, sessions) : null;
  const lifetime = lifetimeStats(sessions);

  const lastExportAt = settings.lastExportAt;
  const backup = backupStatus(sessions, lastExportAt, now);

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
      const outcome = await exportNow();
      if (outcome !== 'cancelled') setToast(t(EXPORT_TOAST_KEY[outcome]));
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('common.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header home-header">
        <div className="home-header-text">
          <div className="home-date">{formatLongDate(locale, now)}</div>
          <h1 className="page-title">{name ? t('home.greetingWithName', { greeting, name }) : greeting}</h1>
        </div>
        <div className="home-header-actions">
          <button
            className="icon-btn icon-btn-filled"
            aria-label={theme === 'light' ? t('home.themeToDark') : t('home.themeToLight')}
            onClick={toggleTheme}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button className="icon-btn icon-btn-filled" aria-label={t('settings.title')} onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
          <button type="button" className="avatar" onClick={() => navigate('/profile')} aria-label={t('home.greetingAria')}>
            {name ? initials(name) : <UserIcon />}
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
          {/* --- week counter + streak + stats shortcut --------------------- */}
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
                    <FlameIcon />
                    {t(streak === 1 ? 'home.streakWeekOne' : 'home.streakWeekOther', { count: streak })}
                  </div>
                )}
              </div>

              {/* The week counter's push view (§5.6). Hidden until there is
                  history, so a fresh install keeps its empty state. */}
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="home-stats-btn"
                  onClick={() => navigate('/stats')}
                  aria-label={t('home.seeAllStats')}
                >
                  <ChartIcon />
                  <span>{t('home.statsBoxLabel')}</span>
                </button>
              )}
            </div>
          </section>

          {/* --- today's training ----------------------------------------- */}
          <section className="section">
            <div className="section-head">
              <div className="section-title">{t('home.todaySection')}</div>
              {doneToday && (
                <span className="pill pill-accent home-done">
                  {t('home.completedToday')} · {doneToday.trainingLabel}
                </span>
              )}
            </div>

            {active ? (
              <button className="card card-tappable home-card home-card-active" onClick={() => navigate('/session')}>
                <div className="home-card-main">
                  <span className="pill pill-accent">{t('home.inProgress')}</span>
                  <div className="home-card-title">{active.trainingLabel}</div>
                  <div className="home-card-cta">
                    {t('home.resumeSession')}
                    <ChevronRightIcon />
                  </div>
                </div>
              </button>
            ) : today ? (
              <button className="card card-tappable home-card" disabled={busy} onClick={() => void handleStart(today.id)} aria-label={`${t('home.startSession')}: ${today.label}`}>
                <div className="home-card-main">
                  <div className="home-card-badge" aria-hidden="true">
                    {trainingBadge(today)}
                  </div>
                  <div className="home-card-title">{today.label}</div>
                  <div className="home-card-last">
                    {lastForToday ? (
                      <>
                        <span>{formatDay(locale, lastForToday.startedAt, now)}</span>
                        <span className="home-card-dot">·</span>
                        <span>{daysAgoLabel(t, daysBetween(new Date(lastForToday.startedAt), now))}</span>
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
                </div>
                <div className="home-card-play" aria-hidden="true">
                  <PlayIcon />
                </div>
              </button>
            ) : (
              <div className="card card-pad home-empty">
                <p className="home-empty-text">{t('home.noTrainingsYet')}</p>
                <button className="btn btn-tinted" onClick={() => navigate('/trainings')}>
                  {t('home.goToTrainings')}
                </button>
              </div>
            )}
          </section>

          {/* --- calendar --------------------------------------------------- */}
          {(sessions.length > 0 || sportSessions.length > 0) && (
            <section className="section">
              <div className="section-title">{t('home.calendarSection')}</div>
              <HomeCalendar sessions={sessions} sportSessions={sportSessions} trainings={trainings} now={now} locale={locale} />
            </section>
          )}

          {/* --- backup reminder ------------------------------------------ */}
          {backup.due && !bannerDismissed && (
            <section className="section">
              <div className="home-banner">
                <button className="home-banner-main" disabled={busy} onClick={() => void handleExport()}>
                  <AlertIcon className="home-banner-icon" />
                  <span className="home-banner-text">
                    <span className="home-banner-title">{lastExportAt ? t('home.backupOutdated') : t('home.backupFirst')}</span>
                    <span className="home-banner-body">
                      {backup.unsaved > 0
                        ? t(backup.unsaved === 1 ? 'home.backupUnsavedOne' : 'home.backupUnsavedOther', {
                            count: backup.unsaved,
                          })
                        : t('home.backupBody')}
                    </span>
                  </span>
                </button>
                <button className="icon-btn home-banner-dismiss" aria-label={t('home.dismissBackup')} onClick={() => setBannerDismissed(true)}>
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
              {lifetime.since && <> · {t('home.lifetimeSince', { date: formatMonthYear(locale, lifetime.since) })}</>}
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

/** One calendar-day badge: a resolvable id to open, an icon, and a label for the day's aria description. */
type DayBadge = { id: string; badge: string; label: string };

/**
 * Month calendar: one primary activity per day (the gym session if there is
 * one, else the first sport session), with a pip for each further activity.
 * Tapping a trained day opens its primary entry in History; the month in view
 * is local state, independent of `now`.
 */
function HomeCalendar({
  sessions,
  sportSessions,
  trainings,
  now,
  locale,
}: {
  sessions: Session[];
  sportSessions: SportSession[];
  trainings: Training[];
  now: Date;
  locale: string;
}) {
  const { t } = useLanguage();
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const sportByDay = useMemo(() => sportSessionsByDay(sportSessions), [sportSessions]);
  const trainingsById = useMemo(() => new Map(trainings.map((tr) => [tr.id, tr])), [trainings]);
  const grid = useMemo(() => monthGrid(month), [month]);

  const weekdays = grid.slice(0, 7).map(({ date }) => ({
    narrow: date.toLocaleDateString(locale, { weekday: 'narrow' }),
    full: date.toLocaleDateString(locale, { weekday: 'long' }),
  }));

  const PIP_CAP = 3;

  return (
    <div className="card card-pad home-cal">
      <div className="home-cal-head">
        <div className="home-cal-title">{formatMonthYear(locale, month)}</div>
        <div className="home-cal-nav">
          <button className="icon-btn" aria-label={t('home.prevMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeftIcon />
          </button>
          <button className="icon-btn" aria-label={t('home.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRightIcon />
          </button>
        </div>
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
          const key = dayKey(date);
          const session = byDay.get(key);
          const sports = sportByDay.get(key) ?? [];
          const classes = ['home-cal-day'];
          if (!inMonth) classes.push('home-cal-day-out');
          if (isSameDay(date, now)) classes.push('home-cal-day-today');

          const badges: DayBadge[] = [];
          if (session) {
            badges.push({
              id: session.id,
              badge: trainingBadge(trainingsById.get(session.trainingId), session.trainingLabel),
              label: session.trainingLabel,
            });
          }
          for (const s of sports) {
            badges.push({
              id: s.id,
              badge: trainingBadge(trainingsById.get(s.trainingId), s.trainingLabel),
              label: s.trainingLabel,
            });
          }

          if (badges.length === 0) {
            return (
              <div className={classes.join(' ')} key={key}>
                <span className="home-cal-daynum">{date.getDate()}</span>
              </div>
            );
          }

          classes.push('home-cal-day-trained');
          const primary = badges[0]!;
          const extra = badges.slice(1);

          return (
            <button
              type="button"
              className={classes.join(' ')}
              key={key}
              onClick={() => navigate(`/history/${primary.id}`)}
              aria-label={`${date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, ${badges.map((b) => b.label).join(', ')}`}
            >
              <span className="home-cal-daynum">{date.getDate()}</span>
              <span className="home-cal-dot" aria-hidden="true">
                {primary.badge}
              </span>
              {extra.length > 0 && (
                <span className="home-cal-pips" aria-hidden="true">
                  {extra.slice(0, PIP_CAP).map((b) => (
                    <span className="home-cal-pip" key={b.id} />
                  ))}
                  {extra.length > PIP_CAP && <span className="home-cal-pip-more">+{extra.length - PIP_CAP}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
