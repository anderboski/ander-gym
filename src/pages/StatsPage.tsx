/**
 * Stats — SPEC §5.6.
 *
 * A push view off Home rather than a sixth tab: D1 locks the navigation at five
 * tabs, so this route reports `home` from `tabOf()` and the tab bar stays lit on
 * Home while it is open — the same arrangement as a training or a session
 * detail.
 *
 * Everything here is derived from `sessions`; nothing new is stored. The two
 * aggregates walk every session, so both are memoised on the `sessions`
 * identity (which every mutation replaces wholesale) and on a `now` captured
 * once, so a re-render never re-scans the history.
 */
import { useMemo, useState } from 'react';
import { useGym } from '../data/store';
import {
  formatShortDate,
  personalRecordEvents,
  UNKNOWN_TARGET,
  volumeByTarget,
  weeklySummary,
  type PersonalRecordEvent,
  type WeekStat,
} from '../data/derive';
import { formatCompact, formatSet, titleCase } from '../data/parse';
import { BarList, BarStrip, ChartFigure, LineChart } from '../components/Chart';
import { ChevronLeftIcon } from '../components/icons';
import { navigate } from '../router';
import { useLanguage } from '../data/i18n';
import type { Exercise } from '../data/types';
import './StatsPage.css';

/** Long enough to show a habit, short enough to fit a phone width. */
const WEEKS = 12;

/** The window the muscle-balance breakdown asks "am I skipping legs?" over. */
const BALANCE_DAYS = 30;

/** How many recent PRs the list shows — a glance, not a full log. */
const RECENT_PRS = 5;

const kg = (value: number) => `${formatCompact(value)} kg`;

export function StatsPage() {
  const { status, sessions, exerciseById, settings } = useGym();
  const { t } = useLanguage();

  // Captured once: it is a memo key, and a fresh Date per render would
  // invalidate both aggregates on every keystroke elsewhere in the tree.
  const [now] = useState(() => new Date());

  const weeks = useMemo(() => weeklySummary(sessions, WEEKS, now), [sessions, now]);
  const balance = useMemo(
    () => volumeByTarget(sessions, exerciseById, BALANCE_DAYS, now),
    [sessions, exerciseById, now],
  );
  const recentPrs = useMemo(
    () => personalRecordEvents(sessions).slice(0, RECENT_PRS),
    [sessions],
  );

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
        <h1 className="page-title">{t('stats.title')}</h1>
        <div className="page-sub">{t('stats.subtitle')}</div>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">{t('history.emptyState')}</div>
      ) : (
        <>
          <section className="section">
            <div className="card card-pad">
              <RecentPRs events={recentPrs} exerciseById={exerciseById} />
            </div>
          </section>

          <section className="section">
            <div className="card card-pad">
              <VolumeTrend weeks={weeks} />
            </div>
          </section>

          <section className="section">
            <div className="card card-pad">
              <Consistency weeks={weeks} goal={settings.weeklyGoal} />
            </div>
          </section>

          <section className="section">
            <div className="card card-pad">
              <MuscleBalance
                rows={balance}
                labelOf={(target) =>
                  target === UNKNOWN_TARGET ? t('stats.removedExercises') : titleCase(target)
                }
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function edgeLabels(weeks: WeekStat[]): [string, string] | undefined {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first && last ? [formatShortDate(first.start), formatShortDate(last.start)] : undefined;
}

/**
 * The last few times a set became a new heaviest-ever load for its exercise.
 * A plain list, not a chart — there is no shared axis a "heaviest weight"
 * across unrelated exercises (a squat PR and a curl PR) could sit on.
 */
function RecentPRs({
  events,
  exerciseById,
}: {
  events: PersonalRecordEvent[];
  exerciseById: Map<string, Exercise>;
}) {
  const { t } = useLanguage();

  if (events.length === 0) {
    return (
      <ChartFigure title={t('stats.recentPrsTitle')}>
        <div className="stats-empty">{t('stats.recentPrsEmpty')}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure title={t('stats.recentPrsTitle')}>
      <ul className="stats-pr-list">
        {events.map(({ exerciseId, set }, i) => {
          const name = exerciseById.get(exerciseId)?.name ?? exerciseId;
          return (
            <li className="stats-pr-row" key={`${exerciseId}-${i}`}>
              <span className="stats-pr-name">{name}</span>
              <span className="stats-pr-set num">{formatSet(set.reps, set.weight)}</span>
              <span className="stats-pr-date num">{formatShortDate(set.at)}</span>
            </li>
          );
        })}
      </ul>
    </ChartFigure>
  );
}

/** Weekly volume in kg. A single series, so the title is its legend. */
function VolumeTrend({ weeks }: { weeks: WeekStat[] }) {
  const { t } = useLanguage();
  const values = weeks.map((w) => w.volume);
  const current = values[values.length - 1] ?? 0;
  const best = values.reduce((m, v) => Math.max(m, v), 0);
  const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  return (
    <ChartFigure
      title={t('stats.weeklyVolume')}
      value={kg(current)}
      caption={t('stats.volumeCaption', { weeks: WEEKS, average: kg(average), best: kg(best) })}
    >
      <LineChart
        values={values}
        formatTick={formatCompact}
        xLabels={edgeLabels(weeks)}
        ariaLabel={t('stats.volumeAria', { weeks: WEEKS, current: kg(current), average: kg(average), best: kg(best) })}
      />
    </ChartFigure>
  );
}

/** Sessions per week against the weekly goal. */
function Consistency({ weeks, goal }: { weeks: WeekStat[]; goal: number }) {
  const { t } = useLanguage();
  const values = weeks.map((w) => w.sessions);
  const current = values[values.length - 1] ?? 0;
  const met = values.filter((v) => v >= goal).length;
  const total = values.reduce((s, v) => s + v, 0);

  return (
    <ChartFigure
      title={t('stats.sessionsPerWeek')}
      value={t('stats.currentThisWeek', { count: current })}
      caption={t('stats.consistencyCaption', { total, weeks: WEEKS, goal, met })}
    >
      <BarStrip
        values={values}
        emphasisFrom={goal}
        reference={goal}
        formatTick={(v) => String(v)}
        xLabels={edgeLabels(weeks)}
        ariaLabel={t('stats.consistencyAria', { weeks: WEEKS, total, current, goal, met })}
      />
    </ChartFigure>
  );
}

/**
 * Volume per muscle target over the last 30 days — ranked, so the bottom of the
 * list is the answer to "what am I neglecting?". One hue: the categories have
 * no order of their own and the bar length already carries the magnitude.
 */
function MuscleBalance({
  rows,
  labelOf,
}: {
  rows: { target: string; volume: number; sets: number }[];
  labelOf: (target: string) => string;
}) {
  const { t } = useLanguage();
  const leader = rows[0];
  const trailer = rows[rows.length - 1];

  if (!leader || !trailer) {
    return (
      <ChartFigure title={t('stats.muscleBalanceTitle', { days: BALANCE_DAYS })}>
        <div className="stats-empty">{t('stats.muscleBalanceEmpty', { days: BALANCE_DAYS })}</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={t('stats.muscleBalanceTitle', { days: BALANCE_DAYS })}
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
