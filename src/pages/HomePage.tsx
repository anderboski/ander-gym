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
  backupStatus,
  completedToday,
  currentWeekCount,
  dayKey,
  daysBetween,
  formatDurationEstimate,
  greetingBucket,
  parseLocalDate,
  isSameDay,
  lastSessionForTraining,
  lastSportSessionForTraining,
  lifetimeStats,
  monthGrid,
  nextTraining,
  sessionsByDay,
  sportSessionsByDay,
  startOfMonth,
  trainingBadge,
  upcomingPlans,
  weeklyStreak,
} from '../data/derive';
import { formatCompact } from '../data/parse';
import { trainingKindLabel } from '../data/sportLabels';
import type { ExportOutcome } from '../data/backup';
import { navigate } from '../router';
import {
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FlameIcon,
  GearIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  SunIcon,
} from '../components/icons';
import { AvatarFace } from '../components/Avatar';
import { SettingsSheet } from '../components/SettingsSheet';
import { Sheet, Toast } from '../components/Sheet';
import { SportLogSheet } from '../components/SportLogSheet';
import { useTransient } from '../hooks/useTransient';
import { getTheme, otherTheme, setTheme, type Theme } from '../data/theme';
import { daysAgoLabel, formatDay, formatDayWithWeekday, formatLongDate, formatMonthYear, useLanguage, type TranslationKey } from '../data/i18n';
import type { Session, SportSession, Training, TrainingPlan } from '../data/types';
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

export function HomePage() {
  const {
    status,
    error,
    trainings,
    sessions,
    sportSessions,
    active,
    settings,
    profile,
    startSession,
    exportNow,
    logSportSession,
    plans,
    planTraining,
    clearPlan,
  } = useGym();

  const { t, locale } = useLanguage();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useTransient<string>(3200);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  // Logging from an empty calendar day (§5.1): pick the activity, then its log
  // sheet opens with that day already filled in.
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [logging, setLogging] = useState<{ training: Training; date: string } | null>(null);
  // Planning a future calendar day (§5.1), and the undo offer after a plan is removed.
  const [planningFor, setPlanningFor] = useState<string | null>(null);
  const [undoPlan, setUndoPlan] = useTransient<TrainingPlan>(5000);

  function toggleTheme() {
    const next = otherTheme(theme);
    setTheme(next);
    setThemeState(next);
  }

  const now = new Date();
  const name = profile.name.trim();
  const greeting = t(GREETING_KEYS[greetingBucket(now)]);
  const goal = settings.weeklyGoal;
  const weekCount = currentWeekCount(sessions, sportSessions, now);
  const streak = weeklyStreak(sessions, sportSessions, goal, now);
  const today = nextTraining(trainings, sessions);
  const doneToday = completedToday(sessions, now);
  const lifetime = lifetimeStats(sessions);
  // The Trainings page's "Other activities" section, same filter.
  const otherActivities = trainings.filter((tr) => !tr.archived && (tr.kind ?? 'gym') !== 'gym');
  // Anything can be planned, gym or not — listed in the Trainings page's own
  // section order: gym trainings first, then other activities.
  const plannable = [...trainings.filter((tr) => !tr.archived && (tr.kind ?? 'gym') === 'gym'), ...otherActivities];
  const todayKey = dayKey(now);
  const plansByDay = upcomingPlans(plans, trainings, now);
  const todayPlan = plansByDay.get(todayKey) ?? null;
  // A plan for today takes the Today card over from the rotation (§5.1).
  const cardTraining = todayPlan ?? today;
  const cardIsGym = (cardTraining?.kind ?? 'gym') === 'gym';
  const lastForCard = cardTraining && cardIsGym ? lastSessionForTraining(cardTraining.id, sessions) : null;
  const lastSportForCard = cardTraining && !cardIsGym ? lastSportSessionForTraining(cardTraining.id, sportSessions) : null;
  const lastCardDate = lastForCard ? new Date(lastForCard.startedAt) : lastSportForCard ? parseLocalDate(lastSportForCard.date) : null;
  const durationEstimate = cardTraining && cardIsGym ? averageSessionMinutes(cardTraining.id, sessions) : null;

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

  /**
   * Acting on a plan: a gym training starts its live session now; anything
   * else opens its log sheet for today. With a session already in progress a
   * gym plan resumes that one instead — starting would silently replace it.
   */
  function confirmPlan(training: Training) {
    if ((training.kind ?? 'gym') !== 'gym') {
      setLogging({ training, date: todayKey });
    } else if (active) {
      navigate('/session');
    } else {
      void handleStart(training.id);
    }
  }

  async function handlePlan(date: string, trainingId: string) {
    setPlanningFor(null);
    try {
      await planTraining(date, trainingId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('common.unknownError'));
    }
  }

  async function handleClearPlan(date: string) {
    setPlanningFor(null);
    try {
      const removed = await clearPlan(date);
      if (removed) setUndoPlan(removed);
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('common.unknownError'));
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
            <AvatarFace name={name} photoBlob={profile.photoBlob} />
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
            ) : cardTraining ? (
              <>
                <button
                  className="card card-tappable home-card"
                  disabled={busy}
                  onClick={() => (todayPlan ? confirmPlan(todayPlan) : void handleStart(cardTraining.id))}
                  aria-label={`${cardIsGym ? t('home.startSession') : t('home.logActivityTitle')}: ${cardTraining.label}`}
                >
                  <div className="home-card-main">
                    <div className="home-card-top">
                      <div className="home-card-badge" aria-hidden="true">
                        {trainingBadge(cardTraining)}
                      </div>
                      {todayPlan && <span className="pill pill-accent">{t('home.plannedPill')}</span>}
                    </div>
                    <div className="home-card-title">{cardTraining.label}</div>
                    <div className="home-card-last">
                      {!cardIsGym && (
                        <>
                          <span>{trainingKindLabel(t, cardTraining.kind ?? 'gym')}</span>
                          <span className="home-card-dot">·</span>
                        </>
                      )}
                      {lastCardDate ? (
                        <>
                          <span>{formatDay(locale, lastCardDate, now)}</span>
                          <span className="home-card-dot">·</span>
                          <span>{daysAgoLabel(t, daysBetween(lastCardDate, now))}</span>
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
                    {cardIsGym ? <PlayIcon /> : <PlusIcon />}
                  </div>
                </button>
                {/* The way out of a plan on the day itself: drops it, and the card
                    falls back to the rotation. */}
                {todayPlan && (
                  <button type="button" className="btn btn-ghost btn-sm home-plan-skip" onClick={() => void handleClearPlan(todayKey)}>
                    {t('home.planSkip')}
                  </button>
                )}
              </>
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
          {(sessions.length > 0 || sportSessions.length > 0 || plansByDay.size > 0) && (
            <section className="section">
              <div className="section-title">{t('home.calendarSection')}</div>
              <HomeCalendar
                sessions={sessions}
                sportSessions={sportSessions}
                trainings={trainings}
                now={now}
                locale={locale}
                onLogDay={otherActivities.length > 0 ? setPickingFor : undefined}
                plans={plansByDay}
                onPlanDay={plannable.length > 0 ? setPlanningFor : undefined}
                onConfirmPlan={confirmPlan}
              />
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
      {pickingFor && (
        <Sheet title={t('home.logActivityTitle')} onClose={() => setPickingFor(null)}>
          <p className="hint home-pick-hint">
            {t('home.logActivityDay', { date: formatDayWithWeekday(locale, parseLocalDate(pickingFor), now) })}
          </p>
          <div className="card">
            {otherActivities.map((tr) => (
              <button
                key={tr.id}
                type="button"
                className="home-pick-row card-row"
                onClick={() => {
                  setLogging({ training: tr, date: pickingFor });
                  setPickingFor(null);
                }}
              >
                <span className="home-pick-badge" aria-hidden="true">
                  {trainingBadge(tr)}
                </span>
                <span className="home-pick-text">
                  <span className="home-pick-label">{tr.label}</span>
                  <span className="home-pick-kind">{trainingKindLabel(t, tr.kind ?? 'gym')}</span>
                </span>
                <ChevronRightIcon className="home-pick-chevron" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {planningFor && (
        <PlanSheet
          date={planningFor}
          now={now}
          trainings={plannable}
          plannedId={plansByDay.get(planningFor)?.id ?? null}
          onPick={(trainingId) => void handlePlan(planningFor, trainingId)}
          onRemove={() => void handleClearPlan(planningFor)}
          onClose={() => setPlanningFor(null)}
        />
      )}
      {logging && (
        <SportLogSheet
          training={logging.training}
          initialDate={logging.date}
          onClose={() => setLogging(null)}
          onSubmit={(input) => logSportSession(logging.training.id, input)}
        />
      )}
      {undoPlan ? (
        <Toast
          message={t('home.planRemoved')}
          actionLabel={t('common.undo')}
          onAction={() => {
            setUndoPlan(null);
            void handlePlan(undoPlan.date, undoPlan.trainingId);
          }}
        />
      ) : (
        toast && <Toast message={toast} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Plan a future day (§5.1): every unarchived training, gym or not, with the
 * one already planned for that day ticked. Picking another replaces it.
 */
function PlanSheet({
  date,
  now,
  trainings,
  plannedId,
  onPick,
  onRemove,
  onClose,
}: {
  date: string;
  now: Date;
  trainings: Training[];
  plannedId: string | null;
  onPick: (trainingId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useLanguage();

  return (
    <Sheet
      title={t('home.planTitle')}
      onClose={onClose}
      footer={
        plannedId ? (
          <button type="button" className="btn btn-danger btn-block" onClick={onRemove}>
            {t('home.planRemove')}
          </button>
        ) : undefined
      }
    >
      <p className="hint home-pick-hint">
        {t('home.planDay', { date: formatDayWithWeekday(locale, parseLocalDate(date), now) })}
      </p>
      <div className="card">
        {trainings.map((tr) => (
          <button
            key={tr.id}
            type="button"
            className="home-pick-row card-row"
            aria-pressed={tr.id === plannedId}
            onClick={() => (tr.id === plannedId ? onClose() : onPick(tr.id))}
          >
            <span className="home-pick-badge" aria-hidden="true">
              {trainingBadge(tr)}
            </span>
            <span className="home-pick-text">
              <span className="home-pick-label">{tr.label}</span>
              <span className="home-pick-kind">{trainingKindLabel(t, tr.kind ?? 'gym')}</span>
            </span>
            {tr.id === plannedId && <CheckIcon className="home-pick-check" />}
          </button>
        ))}
      </div>
    </Sheet>
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

/** How long each face of a multi-activity day's medallion shows before it flips to the next. */
const MEDALLION_STEP_MS = 2500;

/** Pips under a medallion beyond this collapse into "+N" — a day cell is ~48 pt wide. */
const PIP_CAP = 5;

/**
 * Month calendar. A day with one activity shows its badge; a day with several
 * shows a medallion that flips through every one of them (gym sessions oldest
 * first, then sport sessions), with a pip per activity marking which face is
 * up. Tapping a day opens whichever activity is showing at that moment; tapping
 * an empty day up to today hands it to `onLogDay`, and a later one to
 * `onPlanDay`. A planned day is shaded with its training's badge; tapping it
 * acts on the plan when it is today and re-plans it when it is later. The
 * month in view is local state, independent of `now`.
 */
function HomeCalendar({
  sessions,
  sportSessions,
  trainings,
  now,
  locale,
  onLogDay,
  plans,
  onPlanDay,
  onConfirmPlan,
}: {
  sessions: Session[];
  sportSessions: SportSession[];
  trainings: Training[];
  now: Date;
  locale: string;
  /** Absent when there is no activity to log, which leaves empty past days inert. */
  onLogDay?: (date: string) => void;
  /** Today's and later plans by day, from `upcomingPlans`. */
  plans: Map<string, Training>;
  /** Absent when there is no training to plan, which leaves empty future days inert. */
  onPlanDay?: (date: string) => void;
  /** Today's planned cell acts on the plan, same as the Today card. */
  onConfirmPlan: (training: Training) => void;
}) {
  const { t } = useLanguage();
  const [month, setMonth] = useState<Date>(() => startOfMonth(now));
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const sportByDay = useMemo(() => sportSessionsByDay(sportSessions), [sportSessions]);
  const trainingsById = useMemo(() => new Map(trainings.map((tr) => [tr.id, tr])), [trainings]);
  const grid = useMemo(() => monthGrid(month), [month]);

  const cells = useMemo(
    () =>
      grid.map(({ date, inMonth }) => {
        const key = dayKey(date);
        const badges: DayBadge[] = [...(byDay.get(key) ?? []), ...(sportByDay.get(key) ?? [])].map((s) => ({
          id: s.id,
          badge: trainingBadge(trainingsById.get(s.trainingId), s.trainingLabel),
          label: s.trainingLabel,
        }));
        return { date, inMonth, key, badges };
      }),
    [grid, byDay, sportByDay, trainingsById],
  );

  // One counter shared by every medallion, so the whole month flips in step
  // rather than each cell on its own phase. The timer only runs while the
  // month in view has something to flip.
  const [step, setStep] = useState(0);
  const anyMulti = cells.some((c) => c.badges.length > 1);
  useEffect(() => {
    if (!anyMulti) return;
    const id = window.setInterval(() => setStep((n) => n + 1), MEDALLION_STEP_MS);
    return () => window.clearInterval(id);
  }, [anyMulti]);

  const weekdays = grid.slice(0, 7).map(({ date }) => ({
    narrow: date.toLocaleDateString(locale, { weekday: 'narrow' }),
    full: date.toLocaleDateString(locale, { weekday: 'long' }),
  }));

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
        {cells.map(({ date, inMonth, key, badges }) => {
          const classes = ['home-cal-day'];
          if (!inMonth) classes.push('home-cal-day-out');
          if (isSameDay(date, now)) classes.push('home-cal-day-today');

          const multi = badges.length > 1;
          const face = step % Math.max(badges.length, 1);
          const current = badges[face];

          if (!current) {
            const dayLabel = date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
            const todayKey = dayKey(now);
            // `plans` only holds today onward, and logging anything on a day
            // clears its plan, so a planned cell is always otherwise empty.
            const planned = plans.get(key);
            if (planned) {
              return (
                <button
                  type="button"
                  className={[...classes, 'home-cal-day-planned'].join(' ')}
                  key={key}
                  // Today's plan is due now; a later one can still be changed.
                  onClick={() => (key === todayKey ? onConfirmPlan(planned) : onPlanDay?.(key))}
                  aria-label={t('home.plannedAria', { date: dayLabel, label: planned.label })}
                >
                  <span className="home-cal-daynum">{date.getDate()}</span>
                  <span className="home-cal-dot home-cal-dot-planned" aria-hidden="true">
                    {trainingBadge(planned)}
                  </span>
                </button>
              );
            }
            // A future day is for planning, not logging — sport logs are capped
            // at today (§5.8) and a gym session can only start now. Keys compare
            // as strings: `YYYY-MM-DD` sorts chronologically.
            if (onPlanDay && key > todayKey) {
              return (
                <button
                  type="button"
                  className={[...classes, 'home-cal-day-loggable'].join(' ')}
                  key={key}
                  onClick={() => onPlanDay(key)}
                  aria-label={t('home.planAria', { date: dayLabel })}
                >
                  <span className="home-cal-daynum">{date.getDate()}</span>
                </button>
              );
            }
            if (onLogDay && key <= todayKey) {
              return (
                <button
                  type="button"
                  className={[...classes, 'home-cal-day-loggable'].join(' ')}
                  key={key}
                  onClick={() => onLogDay(key)}
                  aria-label={t('home.logActivityAria', { date: dayLabel })}
                >
                  <span className="home-cal-daynum">{date.getDate()}</span>
                </button>
              );
            }
            return (
              <div className={classes.join(' ')} key={key}>
                <span className="home-cal-daynum">{date.getDate()}</span>
              </div>
            );
          }

          classes.push('home-cal-day-trained');

          return (
            <button
              type="button"
              className={classes.join(' ')}
              key={key}
              // `current` comes from the same render that drew the face, so the
              // activity a tap opens is always the one on screen.
              onClick={() => navigate(`/history/${current.id}`)}
              aria-label={`${date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, ${badges.map((b) => b.label).join(', ')}`}
            >
              <span className="home-cal-daynum">{date.getDate()}</span>
              <span className="home-cal-dot" aria-hidden="true">
                {/* Keyed by id so each new face remounts and replays the flip;
                    the first face skips it, so opening Home doesn't set every
                    medallion turning at once. */}
                <span key={current.id} className={multi && step > 0 ? 'home-cal-face home-cal-face-flip' : 'home-cal-face'}>
                  {current.badge}
                </span>
              </span>
              {multi && (
                <span className="home-cal-pips" aria-hidden="true">
                  {badges.slice(0, PIP_CAP).map((b, i) => (
                    <span className={i === face ? 'home-cal-pip home-cal-pip-on' : 'home-cal-pip'} key={b.id} />
                  ))}
                  {badges.length > PIP_CAP && <span className="home-cal-pip-more">+{badges.length - PIP_CAP}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
