/**
 * Stats — SPEC §5.6.
 *
 * A push view off Home rather than a sixth tab: D1 locks the navigation at
 * five tabs, so this route reports `home` from `tabOf()` and the tab bar
 * stays lit on Home while it is open — the same arrangement as a training or
 * a session detail.
 *
 * A training-kind switcher (top right of the header) picks which stats show:
 * gym is the default and the only kind with real depth today; snowboard has
 * its own season-comparison chart; cycling and climbing are placeholders.
 * Everything here is derived from `sessions`/`sportSessions`; nothing new is
 * stored. Every aggregate is memoised on its inputs and on a `now` captured
 * once, so a re-render never re-scans the history.
 */
import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  climbGradePyramid,
  defaultStatsView,
  formatShortDate,
  STATS_PERIOD_DAYS,
  STATS_PERIODS,
  STATS_VIEWS_FOR_PERIOD,
  statsBuckets,
  snowboardSeasons,
  topExercises,
  UNKNOWN_TARGET,
  volumeByTarget,
  type ClimbGradeCount,
  type ExerciseCount,
  type PeriodStat,
  type SeasonSplit,
  type StatsPeriod,
  type StatsView,
} from '../data/derive';
import { formatDurationEstimate } from '../data/derive';
import { formatCompact, titleCase } from '../data/parse';
import { translateExerciseName, translateFacetValue } from '../data/exerciseI18n';
import { snowConditionLabel, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import {
  BarList,
  BarStrip,
  ChartFigure,
  ChartLegend,
  type StackedSeriesDef,
  StackedBarStrip,
} from '../components/Chart';
import { ChevronLeftIcon } from '../components/icons';
import { navigate } from '../router';
import { useLanguage, type Language, type TranslationKey } from '../data/i18n';
import {
  SNOW_CONDITIONS,
  WEATHER_CONDITIONS,
  type Exercise,
  type Session,
  type SnowCondition,
  type SportSession,
  type TrainingKind,
  type WeatherCondition,
} from '../data/types';
import './StatsPage.css';

/** Top-right switcher order — gym first (the default), then the three sports. */
const KIND_ORDER: TrainingKind[] = ['gym', 'cycling', 'snowboard', 'climbing'];

const KIND_EMOJI: Record<TrainingKind, string> = {
  gym: '🏋️',
  cycling: '🚴',
  snowboard: '🏂',
  climbing: '🧗',
};

const TOP_EXERCISES_LIMIT = 10;

const kg = (value: number) => `${formatCompact(value)} kg`;

export function StatsPage() {
  const { status, sessions, sportSessions, exerciseById, settings } = useGym();
  const { t } = useLanguage();

  // Captured once: it is a memo key, and a fresh Date per render would
  // invalidate every aggregate on every keystroke elsewhere in the tree.
  const [now] = useState(() => new Date());
  const [kind, setKind] = useState<TrainingKind>('gym');

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" role="status" aria-label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="stats-back" onClick={() => navigate('/home')} aria-label={t('stats.backToHomeAria')}>
          <ChevronLeftIcon />
          <span>{t('tabbar.home')}</span>
        </button>
        <div className="stats-title-row">
          <h1 className="page-title">{t('stats.title')}</h1>
          <div className="stats-kind-switcher" role="tablist" aria-label={t('stats.kindSwitcherAria')}>
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                aria-label={trainingKindLabel(t, k)}
                className="stats-kind-btn"
                onClick={() => setKind(k)}
              >
                <span aria-hidden="true">{KIND_EMOJI[k]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {kind === 'gym' && <GymStats sessions={sessions} exerciseById={exerciseById} weeklyGoal={settings.weeklyGoal} now={now} />}
      {kind === 'snowboard' && <SnowboardStats sportSessions={sportSessions} />}
      {kind === 'cycling' && <div className="empty">{t('stats.cyclingComingSoon')}</div>}
      {kind === 'climbing' && <ClimbingStats sportSessions={sportSessions} now={now} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gym                                                                         */
/* -------------------------------------------------------------------------- */

const PERIOD_LABEL_KEY: Record<StatsPeriod, TranslationKey> = {
  week: 'stats.periodWeek',
  month: 'stats.periodMonth',
  threeMonths: 'stats.periodThreeMonths',
};

const VIEW_LABEL_KEY: Record<StatsView, TranslationKey> = {
  daily: 'stats.viewDaily',
  weekly: 'stats.viewWeekly',
  monthly: 'stats.viewMonthly',
};

const VIEW_UNIT_KEY: Record<StatsView, TranslationKey> = {
  daily: 'stats.unitDay',
  weekly: 'stats.unitWeek',
  monthly: 'stats.unitMonth',
};

const VIEW_SESSIONS_TITLE_KEY: Record<StatsView, TranslationKey> = {
  daily: 'stats.sessionsPerDay',
  weekly: 'stats.sessionsPerWeek',
  monthly: 'stats.sessionsPerMonth',
};

function GymStats({
  sessions,
  exerciseById,
  weeklyGoal,
  now,
}: {
  sessions: Session[];
  exerciseById: Map<string, Exercise>;
  weeklyGoal: number;
  now: Date;
}) {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [view, setView] = useState<StatsView>(defaultStatsView('month'));

  const views = STATS_VIEWS_FOR_PERIOD[period];
  const days = STATS_PERIOD_DAYS[period];

  const buckets = useMemo(() => statsBuckets(sessions, period, view, now), [sessions, period, view, now]);
  const balance = useMemo(
    () => volumeByTarget(sessions, exerciseById, days, now),
    [sessions, exerciseById, days, now],
  );
  const top = useMemo(
    () => topExercises(sessions, days, now, TOP_EXERCISES_LIMIT),
    [sessions, days, now],
  );

  function choosePeriod(next: StatsPeriod) {
    setPeriod(next);
    if (!STATS_VIEWS_FOR_PERIOD[next].includes(view)) setView(defaultStatsView(next));
  }

  if (sessions.length === 0) {
    return (
      <section className="section">
        <div className="empty">{t('history.emptyState')}</div>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="stats-controls">
          <div className="stats-segment" role="group" aria-label={t('stats.periodAria')}>
            {STATS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                className="stats-segment-btn"
                aria-pressed={period === p}
                onClick={() => choosePeriod(p)}
              >
                {t(PERIOD_LABEL_KEY[p])}
              </button>
            ))}
          </div>
          <div className="stats-segment" role="group" aria-label={t('stats.viewAria')}>
            {views.map((v) => (
              <button
                key={v}
                type="button"
                className="stats-segment-btn"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(VIEW_LABEL_KEY[v])}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <SessionsChart buckets={buckets} view={view} goal={weeklyGoal} />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <DurationChart buckets={buckets} />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <MuscleBalance
            rows={balance}
            days={days}
            labelOf={(target) =>
              target === UNKNOWN_TARGET
                ? t('stats.removedExercises')
                : titleCase(translateFacetValue(language, 'target', target))
            }
          />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <TopExercises rows={top} days={days} exerciseById={exerciseById} language={language} />
        </div>
      </section>
    </>
  );
}

function edgeLabels(buckets: { start: string }[]): [string, string] | undefined {
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  return first && last ? [formatShortDate(first.start), formatShortDate(last.start)] : undefined;
}

/**
 * Sessions per bucket. The weekly goal only reads as a reference line on the
 * weekly view — a daily or monthly bucket isn't the unit the goal is set in
 * — so the emphasis/reference line and the "goal met" caption only appear
 * there; other views get a plain count.
 */
function SessionsChart({ buckets, view, goal }: { buckets: PeriodStat[]; view: StatsView; goal: number }) {
  const { t } = useLanguage();
  const values = buckets.map((b) => b.sessions);
  const current = values[values.length - 1] ?? 0;
  const total = values.reduce((s, v) => s + v, 0);
  const reference = view === 'weekly' ? goal : undefined;
  const met = reference !== undefined ? values.filter((v) => v >= reference).length : undefined;

  return (
    <ChartFigure
      title={t(VIEW_SESSIONS_TITLE_KEY[view])}
      value={t('stats.currentThisUnit', { count: current, unit: t(VIEW_UNIT_KEY[view]) })}
      caption={
        met !== undefined
          ? t('stats.consistencyCaption', { total, weeks: buckets.length, goal, met })
          : t('stats.sessionsCaption', { total })
      }
    >
      <BarStrip
        values={values}
        emphasisFrom={reference}
        reference={reference}
        formatTick={(v) => String(v)}
        xLabels={edgeLabels(buckets)}
        ariaLabel={
          met !== undefined
            ? t('stats.consistencyAria', { weeks: buckets.length, total, current, goal, met })
            : t('stats.sessionsAriaPlain', {
                title: t(VIEW_SESSIONS_TITLE_KEY[view]),
                total,
                current,
                unit: t(VIEW_UNIT_KEY[view]),
              })
        }
      />
    </ChartFigure>
  );
}

/**
 * Average session duration per bucket. Reuses `BarStrip` rather than a line:
 * a bucket with no saved session has no duration to plot, and `BarStrip`
 * already draws an empty bucket as a flat stub rather than a gap or a
 * misleading zero-minute point — the same treatment `SessionsChart` gets.
 */
function DurationChart({ buckets }: { buckets: PeriodStat[] }) {
  const { t } = useLanguage();
  const values = buckets.map((b) => b.avgMinutes ?? 0);
  const withData = buckets.map((b) => b.avgMinutes).filter((m): m is number => m !== null);
  const current = buckets[buckets.length - 1]?.avgMinutes ?? null;
  const best = withData.reduce((m, v) => Math.max(m, v), 0);
  const average = withData.length > 0 ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;

  return (
    <ChartFigure
      title={t('stats.durationTitle')}
      value={current !== null ? formatDurationEstimate(current) : undefined}
      caption={
        withData.length > 0
          ? t('stats.durationCaption', { average: formatDurationEstimate(average), best: formatDurationEstimate(best) })
          : t('stats.durationNoData')
      }
    >
      <BarStrip
        values={values}
        formatTick={(v) => `${Math.round(v)}m`}
        xLabels={edgeLabels(buckets)}
        ariaLabel={
          withData.length > 0
            ? t('stats.durationAria', {
                current: current !== null ? formatDurationEstimate(current) : t('common.unknown'),
                average: formatDurationEstimate(average),
                best: formatDurationEstimate(best),
              })
            : t('stats.durationNoData')
        }
      />
    </ChartFigure>
  );
}

/**
 * Volume per muscle target over the selected period — ranked, so the bottom
 * of the list is the answer to "what am I neglecting?". One hue: the
 * categories have no order of their own and the bar length already carries
 * the magnitude.
 */
function MuscleBalance({
  rows,
  days,
  labelOf,
}: {
  rows: { target: string; volume: number; sets: number }[];
  days: number;
  labelOf: (target: string) => string;
}) {
  const { t } = useLanguage();
  const leader = rows[0];
  const trailer = rows[rows.length - 1];

  if (!leader || !trailer) {
    return (
      <ChartFigure title={t('stats.muscleBalanceTitle', { days })}>
        <div className="stats-empty">{t('stats.muscleBalanceEmpty', { days })}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.muscleBalanceTitle', { days })}
      caption={
        rows.length > 1
          ? t('stats.muscleBalanceCaption', {
              most: labelOf(leader.target).toLowerCase(),
              least: labelOf(trailer.target).toLowerCase(),
            })
          : t('stats.muscleBalanceSingle')
      }
    >
      <BarList
        rows={rows.map((row) => ({
          key: row.target,
          label: labelOf(row.target),
          value: row.volume,
          valueLabel: kg(row.volume),
          note: `${row.sets} ${t(row.sets === 1 ? 'common.setOne' : 'common.setsOther')}`,
        }))}
      />
    </ChartFigure>
  );
}

/** The exercises done most often over the selected period, ranked by session count. */
function TopExercises({
  rows,
  days,
  exerciseById,
  language,
}: {
  rows: ExerciseCount[];
  days: number;
  exerciseById: Map<string, Exercise>;
  language: Language;
}) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <ChartFigure title={t('stats.topExercisesTitle', { days })}>
        <div className="stats-empty">{t('stats.topExercisesEmpty', { days })}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure title={t('stats.topExercisesTitle', { days })}>
      <BarList
        rows={rows.map((row) => {
          const exercise = exerciseById.get(row.exerciseId);
          return {
            key: row.exerciseId,
            label: exercise ? translateExerciseName(language, exercise.name) : t('stats.removedExercises'),
            value: row.count,
            valueLabel: row.count === 1 ? t('stats.timesOne') : t('stats.timesOther', { count: row.count }),
          };
        })}
      />
    </ChartFigure>
  );
}

/* -------------------------------------------------------------------------- */
/* Snowboard                                                                   */
/* -------------------------------------------------------------------------- */

/** Season stack colours in fixed slot order — a category never changes colour as seasons come and go. */
function categoryColor(index: number): string {
  return `var(--chart-cat-${(index % 6) + 1})`;
}

function SnowboardStats({ sportSessions }: { sportSessions: SportSession[] }) {
  const { t } = useLanguage();
  const [split, setSplit] = useState<SeasonSplit>('snow');

  const bars = useMemo(() => snowboardSeasons(sportSessions, split), [sportSessions, split]);

  const keys: readonly string[] = split === 'snow' ? SNOW_CONDITIONS : WEATHER_CONDITIONS;
  const series: StackedSeriesDef[] = keys.map((key, i) => ({
    key,
    label: split === 'snow' ? snowConditionLabel(t, key as SnowCondition) : weatherLabel(t, key as WeatherCondition),
    color: categoryColor(i),
  }));

  const totals = new Map<string, number>();
  for (const bar of bars) {
    for (const seg of bar.segments) totals.set(seg.key, (totals.get(seg.key) ?? 0) + seg.count);
  }

  const legendItems = series
    .filter((s) => (totals.get(s.key) ?? 0) > 0)
    .map((s) => {
      const count = totals.get(s.key) ?? 0;
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        value: count === 1 ? t('stats.seasonDaysOne') : t('stats.seasonDaysOther', { count }),
      };
    });

  const toggle = (
    <div className="stats-segment" role="group" aria-label={t('stats.seasonSplitAria')}>
      <button type="button" className="stats-segment-btn" aria-pressed={split === 'snow'} onClick={() => setSplit('snow')}>
        {t('stats.seasonSplitBySnow')}
      </button>
      <button
        type="button"
        className="stats-segment-btn"
        aria-pressed={split === 'weather'}
        onClick={() => setSplit('weather')}
      >
        {t('stats.seasonSplitByWeather')}
      </button>
    </div>
  );

  if (bars.length === 0) {
    return (
      <section className="section">
        <div className="empty">{t('stats.seasonEmpty')}</div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="card card-pad">
        <ChartFigure
          title={t('stats.seasonTitle')}
          action={toggle}
          caption={<ChartLegend items={legendItems} />}
        >
          <StackedBarStrip
            buckets={bars.map((b) => ({
              label: b.season,
              segments: b.segments.map((s) => ({ key: s.key, value: s.count })),
            }))}
            series={series}
            formatTick={(v) => String(Math.round(v))}
            ariaLabel={t('stats.seasonAria', {
              split: split === 'snow' ? t('stats.seasonSplitNounSnow') : t('stats.seasonSplitNounWeather'),
            })}
          />
        </ChartFigure>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Climbing                                                                    */
/* -------------------------------------------------------------------------- */

function ClimbingStats({ sportSessions, now }: { sportSessions: SportSession[]; now: Date }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const days = STATS_PERIOD_DAYS[period];

  const hasLogs = useMemo(() => sportSessions.some((s) => s.kind === 'climbing'), [sportSessions]);
  const pyramid = useMemo(() => climbGradePyramid(sportSessions, days, now), [sportSessions, days, now]);

  if (!hasLogs) {
    return (
      <section className="section">
        <div className="empty">{t('stats.climbingEmptyState')}</div>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="stats-controls">
          <div className="stats-segment" role="group" aria-label={t('stats.periodAria')}>
            {STATS_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                className="stats-segment-btn"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {t(PERIOD_LABEL_KEY[p])}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <ClimbGradePyramid rows={pyramid} days={days} />
        </div>
      </section>
    </>
  );
}

/**
 * Climbs per grade over the selected period, hardest grade first — the
 * "pyramid" shape a climber expects: a short bar at the hard end tapering to
 * a longer one at the easy end.
 */
function ClimbGradePyramid({ rows, days }: { rows: ClimbGradeCount[]; days: number }) {
  const { t } = useLanguage();
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const hardest = rows.find((r) => r.count > 0);

  if (!hardest) {
    return (
      <ChartFigure title={t('stats.pyramidTitle', { days })}>
        <div className="stats-empty">{t('stats.pyramidEmpty', { days })}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.pyramidTitle', { days })}
      caption={t('stats.pyramidCaption', {
        total: total === 1 ? t('sportLog.climbsSummaryOne') : t('sportLog.climbsSummaryOther', { count: total }),
        grade: hardest.grade,
      })}
    >
      <BarList
        rows={rows.map((r) => ({
          key: r.grade,
          label: t('stats.climbGradeLabel', { grade: r.grade }),
          value: r.count,
          valueLabel: r.count === 1 ? t('sportLog.climbsSummaryOne') : t('sportLog.climbsSummaryOther', { count: r.count }),
        }))}
      />
    </ChartFigure>
  );
}
