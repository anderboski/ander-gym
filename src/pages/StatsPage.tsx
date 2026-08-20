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
 *
 * The time window lives here rather than inside each kind's section, so
 * switching kind keeps the range you were looking at.
 */
import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  climbGradePyramid,
  cyclingRides,
  cyclingSummary,
  dayKey,
  defaultStatsView,
  formatMinutesOfDay,
  formatShortDate,
  formatShortLocalDate,
  formatShortMonth,
  resolveStatsRange,
  STATS_PERIOD_DAYS,
  STATS_PERIODS,
  statsBuckets,
  snowboardSeasons,
  topExercises,
  trailingRange,
  trainingTimeOfDay,
  UNKNOWN_TARGET,
  viewsForRange,
  volumeByTarget,
  type ClimbGradeCount,
  type CustomRangeInput,
  type CyclingRide,
  type CyclingSummary,
  type ExerciseCount,
  type PeriodStat,
  type SeasonSplit,
  type StatsPeriod,
  type StatsRange,
  type StatsView,
  type TrainingTimeMap,
} from '../data/derive';
import { formatDurationEstimate } from '../data/derive';
import { formatCompact, titleCase } from '../data/parse';
import { translateExerciseName, translateFacetValue } from '../data/exerciseI18n';
import { snowConditionLabel, sportSessionSummary, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import {
  BarList,
  BarStrip,
  ChartFigure,
  ChartLegend,
  type StackedSeriesDef,
  StackedBarStrip,
  TimeOfWeekPlot,
  type TimeMarker,
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
  type Training,
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

const PERIOD_LABEL_KEY: Record<StatsPeriod, TranslationKey> = {
  month: 'stats.periodMonth',
  threeMonths: 'stats.periodThreeMonths',
  year: 'stats.periodYear',
  custom: 'stats.periodCustom',
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

const kg = (value: number) => `${formatCompact(value)} kg`;

/** The period the page opens on, and what the custom pickers are pre-filled with. */
const INITIAL_PERIOD = 'month' as const;

export function StatsPage() {
  const { status, sessions, sportSessions, trainings, exerciseById, settings } = useGym();
  const { t, locale } = useLanguage();

  // Captured once: it is a memo key, and a fresh Date per render would
  // invalidate every aggregate on every keystroke elsewhere in the tree.
  const [now] = useState(() => new Date());
  const [kind, setKind] = useState<TrainingKind>('gym');
  const [period, setPeriod] = useState<StatsPeriod>(INITIAL_PERIOD);
  // Pre-filled with the opening period rather than blank, so switching to
  // Custom opens on a window that already draws instead of on an error hint.
  const [custom, setCustom] = useState<CustomRangeInput>(() => {
    const initial = trailingRange(STATS_PERIOD_DAYS[INITIAL_PERIOD], now);
    return { from: dayKey(initial.start), to: dayKey(now) };
  });
  const [view, setView] = useState<StatsView>(() =>
    defaultStatsView(trailingRange(STATS_PERIOD_DAYS[INITIAL_PERIOD], now)),
  );

  const range = useMemo(() => resolveStatsRange(period, now, custom), [period, now, custom]);
  const views = useMemo(() => (range ? viewsForRange(range) : []), [range]);
  // Derived rather than corrected in the change handler: with a custom range
  // the allowed set moves as the dates move, and a state updater that reads
  // other state would be wrong under StrictMode's double invocation.
  const activeView = range && !views.includes(view) ? defaultStatsView(range) : view;

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" role="status" aria-label={t('common.loading')} />
      </div>
    );
  }

  const hasLogs =
    kind === 'gym' ? sessions.length > 0 : sportSessions.some((s) => s.kind === kind);
  // Snowboard is scoped by season, not by a trailing window, so it has no
  // range control at all.
  const scoped = kind !== 'snowboard';

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

      {scoped && hasLogs && (
        <section className="section">
          <RangeControls
            period={period}
            onPeriod={setPeriod}
            custom={custom}
            onCustom={setCustom}
            today={dayKey(now)}
            // Only the gym charts bucket a timeline; the sport cards are lists.
            views={kind === 'gym' ? views : undefined}
            view={activeView}
            onView={setView}
          />
        </section>
      )}

      {scoped && hasLogs && !range && (
        <section className="section">
          <div className="empty">{t('stats.customInvalid')}</div>
        </section>
      )}

      {kind === 'gym' &&
        (!hasLogs ? (
          <EmptyKind message={t('history.emptyState')} />
        ) : (
          range && (
            <GymStats
              sessions={sessions}
              trainings={trainings}
              exerciseById={exerciseById}
              weeklyGoal={settings.weeklyGoal}
              range={range}
              rangeLabel={rangeLabel(t, period, range)}
              view={activeView}
              now={now}
              locale={locale}
            />
          )
        ))}

      {kind === 'snowboard' && <SnowboardStats sportSessions={sportSessions} />}

      {kind === 'cycling' &&
        (!hasLogs ? (
          <EmptyKind message={t('stats.cyclingEmptyState')} />
        ) : (
          range && (
            <CyclingStats sportSessions={sportSessions} range={range} rangeLabel={rangeLabel(t, period, range)} />
          )
        ))}

      {kind === 'climbing' &&
        (!hasLogs ? (
          <EmptyKind message={t('stats.climbingEmptyState')} />
        ) : (
          range && (
            <ClimbingStats sportSessions={sportSessions} range={range} rangeLabel={rangeLabel(t, period, range)} />
          )
        ))}
    </div>
  );
}

function EmptyKind({ message }: { message: string }) {
  return (
    <section className="section">
      <div className="empty">{message}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Time window controls                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Period and bucket-size dropdowns, plus the two date pickers the custom
 * period needs.
 *
 * Native `<select>`s rather than the segmented rows this page used to have:
 * four periods and three views no longer fit side by side on a phone, and iOS
 * renders a select as its own wheel picker — a bigger tap target than any
 * chip row, and one the user already knows.
 *
 * `views` is the set that makes sense for the chosen window
 * (`viewsForRange`), so a combination like a year of daily bars is never
 * offered rather than offered and then rejected. Omitted entirely for the
 * sport kinds, which have no bucketed chart to size.
 */
function RangeControls({
  period,
  onPeriod,
  custom,
  onCustom,
  today,
  views,
  view,
  onView,
}: {
  period: StatsPeriod;
  onPeriod: (period: StatsPeriod) => void;
  custom: CustomRangeInput;
  onCustom: (custom: CustomRangeInput) => void;
  /** `YYYY-MM-DD` — neither picker accepts a future date; there is no history there. */
  today: string;
  views?: StatsView[];
  view: StatsView;
  onView: (view: StatsView) => void;
}) {
  const { t } = useLanguage();
  const viewOptions = views && views.length > 0 ? views : [view];

  return (
    <div className="stats-controls">
      <div className="stats-selects">
        <div className="stats-field">
          <label className="label" htmlFor="stats-period">
            {t('stats.periodLabel')}
          </label>
          <select
            id="stats-period"
            className="input stats-select"
            value={period}
            onChange={(e) => onPeriod(e.target.value as StatsPeriod)}
          >
            {STATS_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(PERIOD_LABEL_KEY[p])}
              </option>
            ))}
          </select>
        </div>

        {views && (
          <div className="stats-field">
            <label className="label" htmlFor="stats-view">
              {t('stats.viewLabel')}
            </label>
            <select
              id="stats-view"
              className="input stats-select"
              value={view}
              // An unusable custom range offers no bucket size at all; the
              // select still names the one in effect rather than going blank.
              disabled={viewOptions.length < 2}
              onChange={(e) => onView(e.target.value as StatsView)}
            >
              {viewOptions.map((v) => (
                <option key={v} value={v}>
                  {t(VIEW_LABEL_KEY[v])}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {period === 'custom' && (
        <div className="stats-selects">
          <div className="stats-field">
            <label className="label" htmlFor="stats-from">
              {t('stats.customFrom')}
            </label>
            <input
              id="stats-from"
              className="input"
              type="date"
              value={custom.from}
              max={today}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            />
          </div>
          <div className="stats-field">
            <label className="label" htmlFor="stats-to">
              {t('stats.customTo')}
            </label>
            <input
              id="stats-to"
              className="input"
              type="date"
              value={custom.to}
              max={today}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How a window is named in a card title: the period's own label for the fixed
 * ones, the two dates for a custom window — "Last 3 months" says more than
 * "90 days", and a custom range has no such name to fall back on.
 */
function rangeLabel(t: (key: TranslationKey) => string, period: StatsPeriod, range: StatsRange): string {
  if (period !== 'custom') return t(PERIOD_LABEL_KEY[period]);
  const lastDay = new Date(range.end.getTime() - 1);
  return `${formatShortDate(range.start.toISOString())} – ${formatShortDate(lastDay.toISOString())}`;
}

/* -------------------------------------------------------------------------- */
/* Gym                                                                         */
/* -------------------------------------------------------------------------- */

function GymStats({
  sessions,
  trainings,
  exerciseById,
  weeklyGoal,
  range,
  rangeLabel,
  view,
  now,
  locale,
}: {
  sessions: Session[];
  trainings: Training[];
  exerciseById: Map<string, Exercise>;
  weeklyGoal: number;
  range: StatsRange;
  rangeLabel: string;
  view: StatsView;
  now: Date;
  locale: string;
}) {
  const { t, language } = useLanguage();
  const includesToday = now.getTime() < range.end.getTime();

  const buckets = useMemo(() => statsBuckets(sessions, range, view), [sessions, range, view]);
  const balance = useMemo(() => volumeByTarget(sessions, exerciseById, range), [sessions, exerciseById, range]);
  const top = useMemo(() => topExercises(sessions, range, TOP_EXERCISES_LIMIT), [sessions, range]);
  const timeMap = useMemo(() => trainingTimeOfDay(sessions, trainings, range), [sessions, trainings, range]);

  return (
    <>
      <section className="section">
        <div className="card card-pad">
          <SessionsChart buckets={buckets} view={view} goal={weeklyGoal} current={includesToday} />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <DurationChart buckets={buckets} view={view} />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <TrainingTimeMapCard map={timeMap} rangeLabel={rangeLabel} locale={locale} />
        </div>
      </section>

      <section className="section">
        <div className="card card-pad">
          <MuscleBalance
            rows={balance}
            rangeLabel={rangeLabel}
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
          <TopExercises rows={top} rangeLabel={rangeLabel} exerciseById={exerciseById} language={language} />
        </div>
      </section>
    </>
  );
}

/**
 * Leading and trailing axis labels. Monthly buckets get the month and year
 * rather than a day: a year of them starts and ends in the same month, and
 * two identical `1 Aug` edges say nothing about the span between them.
 */
function edgeLabels(buckets: { start: string }[], view: StatsView): [string, string] | undefined {
  const format = view === 'monthly' ? formatShortMonth : formatShortDate;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  return first && last ? [format(first.start), format(last.start)] : undefined;
}

/**
 * Sessions per bucket. The weekly goal only reads as a reference line on the
 * weekly view — a daily or monthly bucket isn't the unit the goal is set in
 * — so the emphasis/reference line and the "goal met" caption only appear
 * there; other views get a plain count.
 */
function SessionsChart({
  buckets,
  view,
  goal,
  current: includesToday,
}: {
  buckets: PeriodStat[];
  view: StatsView;
  goal: number;
  /** Whether the last bucket is the one running now — "3 this week" is a lie about a window that ended in March. */
  current: boolean;
}) {
  const { t } = useLanguage();
  const values = buckets.map((b) => b.sessions);
  const current = values[values.length - 1] ?? 0;
  const total = values.reduce((s, v) => s + v, 0);
  const reference = view === 'weekly' ? goal : undefined;
  const met = reference !== undefined ? values.filter((v) => v >= reference).length : undefined;

  return (
    <ChartFigure
      title={t(VIEW_SESSIONS_TITLE_KEY[view])}
      value={t(includesToday ? 'stats.currentThisUnit' : 'stats.currentFinalUnit', {
        count: current,
        unit: t(VIEW_UNIT_KEY[view]),
      })}
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
        xLabels={edgeLabels(buckets, view)}
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
function DurationChart({ buckets, view }: { buckets: PeriodStat[]; view: StatsView }) {
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
        xLabels={edgeLabels(buckets, view)}
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
 * A tapped marker's flag is sized by character count, so a long training name
 * ("Shoulder, Biceps, Triceps") would push the flag wider than the plot. The
 * legend under the chart and the marker's own aria-label both carry the full
 * name, so the flag can afford to clip it.
 */
const FLAG_NAME_MAX = 16;

function flagName(label: string): string {
  return label.length > FLAG_NAME_MAX ? `${label.slice(0, FLAG_NAME_MAX - 1).trimEnd()}…` : label;
}

/** 1 Jan 2024 was a Monday — the reference week the axis labels are formatted from. */
const REFERENCE_MONDAY = new Date(2024, 0, 1);

/**
 * Which training happens on which weekday, at what time — the one gym view
 * that keeps the clock, where every other chart aggregates it away.
 *
 * The badge is the identity channel, not colour: a training's own emoji (or
 * the first letter of its label) is already how it reads on the Trainings
 * list and the Home calendar, and it stays legible for every number of
 * trainings, which a six-slot categorical palette would not.
 */
function TrainingTimeMapCard({
  map,
  rangeLabel,
  locale,
}: {
  map: TrainingTimeMap;
  rangeLabel: string;
  locale: string;
}) {
  const { t } = useLanguage();

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(REFERENCE_MONDAY.getFullYear(), REFERENCE_MONDAY.getMonth(), REFERENCE_MONDAY.getDate() + i);
        return {
          short: date.toLocaleDateString(locale, { weekday: 'short' }),
          long: date.toLocaleDateString(locale, { weekday: 'long' }),
        };
      }),
    [locale],
  );

  if (map.points.length === 0) {
    return (
      <ChartFigure title={t('stats.timeMapTitle', { range: rangeLabel })}>
        <div className="stats-empty">{t('stats.timeMapEmpty')}</div>
      </ChartFigure>
    );
  }

  const markers: TimeMarker[] = map.points.map((point) => {
    const when = `${days[point.weekday]?.short ?? ''} ${formatMinutesOfDay(point.minutes)}`;
    return {
      key: point.sessionId,
      weekday: point.weekday,
      minutes: point.minutes,
      badge: point.badge,
      label: `${flagName(point.label)} · ${when}`,
      ariaLabel: `${point.label} · ${days[point.weekday]?.long ?? ''} ${formatMinutesOfDay(point.minutes)}`,
    };
  });

  return (
    <ChartFigure
      title={t('stats.timeMapTitle', { range: rangeLabel })}
      caption={
        <ul className="stats-map-legend">
          {map.series.map((series) => (
            <li className="stats-map-legend-item" key={series.trainingId}>
              <span className="stats-map-badge" aria-hidden="true">
                {series.badge}
              </span>
              <span className="stats-map-legend-label">{series.label}</span>
              <span className="stats-map-legend-value num">
                {series.count === 1 ? t('stats.timesOne') : t('stats.timesOther', { count: series.count })}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <TimeOfWeekPlot
        markers={markers}
        domain={map.axis}
        dayLabels={days.map((d) => d.short)}
        formatTime={formatMinutesOfDay}
        ariaLabel={t('stats.timeMapAria', {
          count: map.points.length,
          from: formatMinutesOfDay(map.axis[0]),
          to: formatMinutesOfDay(map.axis[1]),
        })}
      />
    </ChartFigure>
  );
}

/**
 * Volume per muscle target over the selected window — ranked, so the bottom
 * of the list is the answer to "what am I neglecting?". One hue: the
 * categories have no order of their own and the bar length already carries
 * the magnitude.
 */
function MuscleBalance({
  rows,
  rangeLabel,
  labelOf,
}: {
  rows: { target: string; volume: number; sets: number }[];
  rangeLabel: string;
  labelOf: (target: string) => string;
}) {
  const { t } = useLanguage();
  const leader = rows[0];
  const trailer = rows[rows.length - 1];

  if (!leader || !trailer) {
    return (
      <ChartFigure title={t('stats.muscleBalanceTitle', { range: rangeLabel })}>
        <div className="stats-empty">{t('stats.rangeEmpty')}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.muscleBalanceTitle', { range: rangeLabel })}
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

/** The exercises done most often over the selected window, ranked by session count. */
function TopExercises({
  rows,
  rangeLabel,
  exerciseById,
  language,
}: {
  rows: ExerciseCount[];
  rangeLabel: string;
  exerciseById: Map<string, Exercise>;
  language: Language;
}) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <ChartFigure title={t('stats.topExercisesTitle', { range: rangeLabel })}>
        <div className="stats-empty">{t('stats.rangeEmpty')}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure title={t('stats.topExercisesTitle', { range: rangeLabel })}>
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
/* Cycling                                                                     */
/* -------------------------------------------------------------------------- */

function CyclingStats({
  sportSessions,
  range,
  rangeLabel,
}: {
  sportSessions: SportSession[];
  range: StatsRange;
  rangeLabel: string;
}) {
  const summary = useMemo(() => cyclingSummary(sportSessions, range), [sportSessions, range]);
  const rides = useMemo(() => cyclingRides(sportSessions, range), [sportSessions, range]);

  return (
    <section className="section">
      <div className="card card-pad">
        <CyclingRides summary={summary} rides={rides} rangeLabel={rangeLabel} />
      </div>
    </section>
  );
}

/**
 * One card: the window's totals as the headline/caption, individual rides
 * below as a `BarList` ranked by distance (newest first, same order
 * `cyclingRides` already returns) — rides are infrequent enough that a
 * bucketed time-series chart like Gym's would read as mostly-empty bars, so
 * this follows the Climbing grade-pyramid's simpler list shape instead.
 */
function CyclingRides({
  summary,
  rides,
  rangeLabel,
}: {
  summary: CyclingSummary;
  rides: CyclingRide[];
  rangeLabel: string;
}) {
  const { t } = useLanguage();

  if (rides.length === 0) {
    return (
      <ChartFigure title={t('stats.cyclingRidesTitle', { range: rangeLabel })}>
        <div className="stats-empty">{t('stats.rangeEmpty')}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.cyclingRidesTitle', { range: rangeLabel })}
      value={`${formatCompact(summary.totalDistanceKm)} km`}
      caption={t('stats.cyclingRidesCaption', {
        rides: summary.rides === 1 ? t('stats.rideOne') : t('stats.rideOther', { count: summary.rides }),
        elevation: `${Math.round(summary.totalElevationM)} m`,
      })}
    >
      <BarList
        rows={rides.map((ride) => ({
          key: ride.id,
          label: formatShortLocalDate(ride.date),
          value: ride.distanceKm,
          valueLabel: sportSessionSummary(t, ride),
          note: ride.elevationPerKm !== null ? t('stats.cyclingElevationPerKm', { value: Math.round(ride.elevationPerKm) }) : undefined,
        }))}
      />
    </ChartFigure>
  );
}

/* -------------------------------------------------------------------------- */
/* Climbing                                                                    */
/* -------------------------------------------------------------------------- */

function ClimbingStats({
  sportSessions,
  range,
  rangeLabel,
}: {
  sportSessions: SportSession[];
  range: StatsRange;
  rangeLabel: string;
}) {
  const pyramid = useMemo(() => climbGradePyramid(sportSessions, range), [sportSessions, range]);

  return (
    <section className="section">
      <div className="card card-pad">
        <ClimbGradePyramid rows={pyramid} rangeLabel={rangeLabel} />
      </div>
    </section>
  );
}

/**
 * Climbs per grade over the selected window, hardest grade first — the
 * "pyramid" shape a climber expects: a short bar at the hard end tapering to
 * a longer one at the easy end.
 */
function ClimbGradePyramid({ rows, rangeLabel }: { rows: ClimbGradeCount[]; rangeLabel: string }) {
  const { t } = useLanguage();
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const hardest = rows.find((r) => r.count > 0);

  if (!hardest) {
    return (
      <ChartFigure title={t('stats.pyramidTitle', { range: rangeLabel })}>
        <div className="stats-empty">{t('stats.rangeEmpty')}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.pyramidTitle', { range: rangeLabel })}
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
