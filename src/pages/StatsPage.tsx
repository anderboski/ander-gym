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
  UNKNOWN_TARGET,
  volumeByTarget,
  weeklySummary,
  type WeekStat,
} from '../data/derive';
import { formatCompact, titleCase } from '../data/parse';
import { BarList, BarStrip, ChartFigure, LineChart } from '../components/Chart';
import { ChevronLeftIcon } from '../components/icons';
import { navigate } from '../router';
import './StatsPage.css';

/** Long enough to show a habit, short enough to fit a phone width. */
const WEEKS = 12;

/** The window the muscle-balance breakdown asks "am I skipping legs?" over. */
const BALANCE_DAYS = 30;

const kg = (value: number) => `${formatCompact(value)} kg`;

export function StatsPage() {
  const { status, sessions, exerciseById, settings } = useGym();

  // Captured once: it is a memo key, and a fresh Date per render would
  // invalidate both aggregates on every keystroke elsewhere in the tree.
  const [now] = useState(() => new Date());

  const weeks = useMemo(() => weeklySummary(sessions, WEEKS, now), [sessions, now]);
  const balance = useMemo(
    () => volumeByTarget(sessions, exerciseById, BALANCE_DAYS, now),
    [sessions, exerciseById, now],
  );

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="stats-back" onClick={() => navigate('/home')} aria-label="Back to home">
          <ChevronLeftIcon />
          <span>Home</span>
        </button>
        <h1 className="page-title">Stats</h1>
        <div className="page-sub">Everything below is derived from your saved sessions.</div>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">No sessions yet — start one from Home.</div>
      ) : (
        <>
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
                  target === UNKNOWN_TARGET ? 'Removed exercises' : titleCase(target)
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

/** Weekly volume in kg. A single series, so the title is its legend. */
function VolumeTrend({ weeks }: { weeks: WeekStat[] }) {
  const values = weeks.map((w) => w.volume);
  const current = values[values.length - 1] ?? 0;
  const best = values.reduce((m, v) => Math.max(m, v), 0);
  const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  return (
    <ChartFigure
      title="Weekly volume"
      value={kg(current)}
      caption={
        <>
          This week · {WEEKS}-week average <span className="num">{kg(average)}</span> · best week{' '}
          <span className="num">{kg(best)}</span>
        </>
      }
    >
      <LineChart
        values={values}
        formatTick={formatCompact}
        xLabels={edgeLabels(weeks)}
        ariaLabel={`Weekly training volume over the last ${WEEKS} weeks, in kilograms: ${kg(current)} this week against a ${WEEKS}-week average of ${kg(average)} and a best week of ${kg(best)}.`}
      />
    </ChartFigure>
  );
}

/** Sessions per week against the weekly goal. */
function Consistency({ weeks, goal }: { weeks: WeekStat[]; goal: number }) {
  const values = weeks.map((w) => w.sessions);
  const current = values[values.length - 1] ?? 0;
  const met = values.filter((v) => v >= goal).length;
  const total = values.reduce((s, v) => s + v, 0);

  return (
    <ChartFigure
      title="Sessions per week"
      value={`${current} this week`}
      caption={
        <>
          <span className="num">{total}</span> sessions over {WEEKS} weeks · goal of{' '}
          <span className="num">{goal}</span> met in <span className="num">{met}</span> of them
        </>
      }
    >
      <BarStrip
        values={values}
        emphasisFrom={goal}
        reference={goal}
        formatTick={(v) => String(v)}
        xLabels={edgeLabels(weeks)}
        ariaLabel={`Sessions per week over the last ${WEEKS} weeks: ${total} in total, ${current} this week, and the weekly goal of ${goal} met in ${met} of the ${WEEKS} weeks.`}
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
  const leader = rows[0];
  const trailer = rows[rows.length - 1];

  if (!leader || !trailer) {
    return (
      <ChartFigure title={`Muscle balance · ${BALANCE_DAYS} days`}>
        <div className="stats-empty">Nothing logged in the last {BALANCE_DAYS} days.</div>
      </ChartFigure>
    );
  }

  return (
    <ChartFigure
      title={`Muscle balance · ${BALANCE_DAYS} days`}
      caption={
        rows.length > 1
          ? `Most volume on ${labelOf(leader.target).toLowerCase()}, least on ${labelOf(trailer.target).toLowerCase()}. A muscle you have not trained at all is simply absent from this list.`
          : 'Only one muscle group trained in this window.'
      }
    >
      <BarList
        rows={rows.map((row) => ({
          key: row.target,
          label: labelOf(row.target),
          value: row.volume,
          valueLabel: kg(row.volume),
          note: `${row.sets} ${row.sets === 1 ? 'set' : 'sets'}`,
        }))}
      />
    </ChartFigure>
  );
}
