/**
 * Chart primitives — hand-rolled inline SVG.
 *
 * No charting dependency: the whole app is 90 kB gzipped and has a Lighthouse
 * ≥ 90 target (SPEC §8), which a library would spend in one import for three
 * small charts.
 *
 * `Plot` owns everything the two SVG charts share — the box, the scales, the
 * gridlines, the axis labels and the accessible summary — and hands its
 * children a `Frame` of ready-made scale functions. `LineChart` and `BarStrip`
 * are the thin marks-only layers on top. Colour comes entirely from the design
 * tokens via Chart.css; a single series wears the accent, so there is no
 * categorical palette to keep colourblind-safe.
 */
import { useState, type ReactNode } from 'react';
import './Chart.css';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * User units, not pixels: the SVG is `width: 100%; height: auto`, so the box
 * scales to whatever the phone gives it and can never push the page sideways.
 */
const BOX = { w: 320, h: 128 };
const PAD = { top: 12, right: 10, bottom: 18, left: 36 };

/** Scales for one plot, in user units. */
export type Frame = {
  /** Centre of slot `i`. */
  x: (i: number) => number;
  y: (value: number) => number;
  /** Width of one slot — what a bar has to fit inside. */
  band: number;
  /** The y of the domain minimum: where bars grow from. */
  base: number;
  left: number;
  right: number;
};

/** Rounds a rough interval up to a 1/2/5 × 10ⁿ step, so axis labels read cleanly. */
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
}

/**
 * Bar domain — always anchored at zero, because a bar encodes its value as a
 * length and a cropped baseline would lie about it.
 *
 * Small whole counts (sessions in a week) top out at exactly the best week
 * rather than at the next round number: rounding 3 up to 4 leaves the tallest
 * bar looking short of a mark that isn't there.
 */
export function zeroDomain(values: number[]): [number, number] {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max <= 0) return [0, 1];
  if (max <= 8 && values.every(Number.isInteger)) return [0, max];
  const step = niceStep(max / 2);
  return [0, Math.ceil(max / step) * step];
}

/**
 * Trend-line domain — padded around the data rather than anchored at zero. A
 * lifter going 30 → 32.5 kg is a real climb, and on a 0-based axis it is a flat
 * line. Both bounds are labelled, so the cropped baseline is never a surprise.
 */
export function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  const step = niceStep(span / 2);
  return [Math.floor((lo - span * 0.15) / step) * step, Math.ceil((hi + span * 0.15) / step) * step];
}

/** A rect with a rounded data-end and square corners at the baseline. */
function barPath(x: number, top: number, w: number, base: number, r: number): string {
  const h = base - top;
  const radius = Math.min(r, w / 2, Math.max(0, h));
  return [
    `M${x} ${base}`,
    `V${top + radius}`,
    `a${radius} ${radius} 0 0 1 ${radius} ${-radius}`,
    `h${w - radius * 2}`,
    `a${radius} ${radius} 0 0 1 ${radius} ${radius}`,
    `V${base}`,
    'Z',
  ].join(' ');
}

/** A plain rect, square corners — the non-topmost segments of a stacked bar. */
function rectPath(x: number, top: number, w: number, base: number): string {
  return `M${x} ${base} V${top} h${w} V${base} Z`;
}

/* -------------------------------------------------------------------------- */
/* Plot                                                                        */
/* -------------------------------------------------------------------------- */

type PlotProps = {
  /** Number of slots on the x axis. */
  count: number;
  domain: [number, number];
  /**
   * `edge` puts the first and last slot on the plot edges (a line spans the
   * full width); `band` centres each slot in its own share (bars).
   */
  spread: 'edge' | 'band';
  formatTick: (value: number) => string;
  /** Leading and trailing x labels. The middle is left to the summary. Ignored when `bandLabels` is given. */
  xLabels?: [string, string];
  /**
   * One label per band slot (e.g. a season), centred under its bar — for a
   * handful of discrete categories rather than a continuous timeline, where
   * only the two edges (`xLabels`) are worth labelling.
   */
  bandLabels?: string[];
  /**
   * What a screen reader hears instead of the picture: the trend in words, not
   * "chart". An SVG is invisible without it.
   */
  ariaLabel: string;
  /**
   * Plot height in user units. The default is a strip, where the y axis only
   * has to separate a handful of bar heights; a 2-D grid needs the room
   * because its y axis carries as much meaning as its x.
   */
  height?: number;
  /** Where to draw a gridline and a tick label. Defaults to the two domain bounds — enough for a strip, not for a grid. */
  ticks?: number[];
  /** Left gutter in user units. Wider than the default for tick labels longer than a compact number, e.g. a clock time. */
  padLeft?: number;
  children: (frame: Frame) => ReactNode;
};

function Plot({ count, domain, spread, formatTick, xLabels, bandLabels, ariaLabel, height, ticks, padLeft, children }: PlotProps) {
  const boxHeight = height ?? BOX.h;
  const left = padLeft ?? PAD.left;
  const right = BOX.w - PAD.right;
  const top = PAD.top;
  const bottom = boxHeight - PAD.bottom;

  const [min, max] = domain;
  const range = max - min || 1;
  const inner = right - left;

  const band = spread === 'band' ? inner / Math.max(1, count) : inner / Math.max(1, count - 1);
  const frame: Frame = {
    // A single point has nowhere to spread to, so it sits in the middle.
    x: (i) =>
      spread === 'band'
        ? left + band * (i + 0.5)
        : count < 2
          ? (left + right) / 2
          : left + band * i,
    y: (value) => bottom - ((value - min) / range) * (bottom - top),
    band,
    base: bottom,
    left,
    right,
  };

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${BOX.w} ${boxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {(ticks ?? domain).map((value) => (
        <g key={value}>
          <line className="chart-grid" x1={left} x2={right} y1={frame.y(value)} y2={frame.y(value)} />
          <text
            className="chart-tick"
            x={left - 6}
            y={frame.y(value)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatTick(value)}
          </text>
        </g>
      ))}

      {children(frame)}

      {bandLabels ? (
        bandLabels.map((label, i) => (
          <text key={i} className="chart-tick" x={frame.x(i)} y={boxHeight - 4} textAnchor="middle">
            {label}
          </text>
        ))
      ) : (
        xLabels && (
          <>
            <text className="chart-tick" x={left} y={boxHeight - 4} textAnchor="start">
              {xLabels[0]}
            </text>
            <text className="chart-tick" x={right} y={boxHeight - 4} textAnchor="end">
              {xLabels[1]}
            </text>
          </>
        )
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                      */
/* -------------------------------------------------------------------------- */

type ChartFigureProps = {
  title: string;
  /** The headline reading — one series needs no legend, this names it instead. */
  value?: string;
  /** One line under the chart: the numbers the marks don't spell out. */
  caption?: ReactNode;
  /** A control belonging to this chart, e.g. a metric toggle. */
  action?: ReactNode;
  children: ReactNode;
};

/** The frame every chart in the app sits in: title, headline, plot, caption. */
export function ChartFigure({ title, value, caption, action, children }: ChartFigureProps) {
  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <div>
          <figcaption className="chart-title">{title}</figcaption>
          {value && <div className="chart-value">{value}</div>}
        </div>
        {action}
      </div>
      <div className="chart-scroll">{children}</div>
      {caption && <div className="chart-caption">{caption}</div>}
    </figure>
  );
}

type LineChartProps = {
  values: number[];
  formatTick: (value: number) => string;
  xLabels?: [string, string];
  ariaLabel: string;
};

/**
 * Single-series trend. Every point carries a dot up to a dozen or so, after
 * which they merge into the line and only the latest keeps one — the dots are
 * there to show that a two-session line is two readings, not an estimate.
 */
export function LineChart({ values, formatTick, xLabels, ariaLabel }: LineChartProps) {
  const domain = paddedDomain(values);

  return (
    <Plot
      count={values.length}
      domain={domain}
      spread="edge"
      formatTick={formatTick}
      xLabels={xLabels}
      ariaLabel={ariaLabel}
    >
      {(frame) => {
        const points = values.map((v, i) => `${frame.x(i)},${frame.y(v)}`).join(' ');
        const last = values.length - 1;
        return (
          <>
            <polygon
              className="chart-wash"
              points={`${frame.x(0)},${frame.base} ${points} ${frame.x(last)},${frame.base}`}
            />
            <polyline className="chart-line" points={points} />
            {values.map((v, i) =>
              values.length <= 12 || i === last ? (
                <circle
                  key={i}
                  className={i === last ? 'chart-dot chart-dot-last' : 'chart-dot'}
                  cx={frame.x(i)}
                  cy={frame.y(v)}
                  r={i === last ? 4 : 3}
                />
              ) : null,
            )}
          </>
        );
      }}
    </Plot>
  );
}

/**
 * The value flag shown above a tapped/focused bar — clamped inside the plot
 * box on both axes so it never gets clipped at an edge bar or a near-max
 * value. Sizing is a rough character-count heuristic rather than measured
 * text: every value here is a short number or a training name, never a
 * paragraph.
 */
function ValueFlag({ x, y, left, right, text }: { x: number; y: number; left: number; right: number; text: string }) {
  const w = Math.max(18, text.length * 6.2 + 8);
  const h = 14;
  const boxX = Math.min(right - w / 2, Math.max(left + w / 2, x)) - w / 2;
  const boxY = Math.max(2, y - h - 4);
  return (
    <g className="chart-tooltip">
      <rect className="chart-tooltip-bg" x={boxX} y={boxY} width={w} height={h} rx={4} />
      <text className="chart-tooltip-text" x={boxX + w / 2} y={boxY + h / 2} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  );
}

/**
 * A transparent tap/focus target for one bar, sized to the full band and
 * plot height — the mark itself (down to 2px wide) is far smaller than a
 * comfortable touch target, so the hit area is the band, not the bar.
 */
function BarHitTarget({
  x,
  band,
  top,
  bottom,
  label,
  active,
  onActivate,
  onDeactivate,
}: {
  x: number;
  band: number;
  top: number;
  bottom: number;
  label: string;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  return (
    <rect
      className="chart-hit"
      x={x - band / 2}
      y={top}
      width={band}
      height={Math.max(0, bottom - top)}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={active}
      // A pointer click fires `focus` before `click` — if `onClick` toggled
      // off an already-active bar, the focus this same tap just triggered
      // would make it look like nothing happened. Both handlers just
      // activate; only losing focus to something else (`onBlur`) clears it.
      onClick={onActivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    />
  );
}

type BarStripProps = {
  values: number[];
  /**
   * Bars at or above this wear the accent and the rest go recessive —
   * emphasis, so "did I hit the goal?" is answered by the picture.
   */
  emphasisFrom?: number;
  /** A horizontal rule across the plot, e.g. the weekly goal. */
  reference?: number;
  formatTick: (value: number) => string;
  xLabels?: [string, string];
  ariaLabel: string;
};

export function BarStrip({
  values,
  emphasisFrom,
  reference,
  formatTick,
  xLabels,
  ariaLabel,
}: BarStripProps) {
  const domain = zeroDomain(values);
  const [active, setActive] = useState<number | null>(null);

  return (
    <Plot
      count={values.length}
      domain={domain}
      spread="band"
      formatTick={formatTick}
      xLabels={xLabels}
      ariaLabel={ariaLabel}
    >
      {(frame) => {
        // 2 units of surface between neighbours — the gap does the separating,
        // never a stroke — and no bar wider than the mark spec allows.
        const width = Math.min(24, Math.max(2, frame.band - 2));
        return (
          <>
            {values.map((value, i) => {
              const x = frame.x(i) - width / 2;
              const empty = value <= 0;
              const top = empty ? frame.base - 2 : frame.y(value);
              const dim = emphasisFrom !== undefined && value < emphasisFrom;
              const base = empty ? 'chart-bar chart-bar-empty' : dim ? 'chart-bar chart-bar-dim' : 'chart-bar';
              return (
                <g key={i}>
                  <path
                    // An empty week is drawn as a stub rather than nothing at all,
                    // so a gap in training reads as zero and not as missing data.
                    className={active === i ? `${base} chart-bar-active` : base}
                    d={barPath(x, top, width, frame.base, 4)}
                  />
                  <BarHitTarget
                    x={frame.x(i)}
                    band={frame.band}
                    top={frame.y(domain[1])}
                    bottom={frame.base}
                    label={formatTick(value)}
                    active={active === i}
                    onActivate={() => setActive(i)}
                    onDeactivate={() => setActive((a) => (a === i ? null : a))}
                  />
                </g>
              );
            })}
            {reference !== undefined && reference > domain[0] && reference <= domain[1] && (
              <line
                className="chart-reference"
                x1={frame.left}
                x2={frame.right}
                y1={frame.y(reference)}
                y2={frame.y(reference)}
              />
            )}
            {active !== null && values[active] !== undefined && (
              <ValueFlag
                x={frame.x(active)}
                y={values[active] <= 0 ? frame.base - 2 : frame.y(values[active])}
                left={frame.left}
                right={frame.right}
                text={formatTick(values[active])}
              />
            )}
          </>
        );
      }}
    </Plot>
  );
}

export type StackedSeriesDef = { key: string; label: string; color: string };

type StackedBarStripProps = {
  /** One entry per x-axis slot (e.g. a season), oldest first. */
  buckets: { label: string; segments: { key: string; value: number }[] }[];
  /** Fixed stacking order (bottom to top) and colour per series key — also the legend order. */
  series: StackedSeriesDef[];
  formatTick: (value: number) => string;
  ariaLabel: string;
};

/**
 * The one chart in the app that is not a single `--accent` series (SPEC
 * §5.6's ski-season exception): each bucket's total is stacked by category,
 * coloured from the `--chart-cat-*` tokens. Zero-value segments are skipped
 * entirely — nothing to stack — and a 1px inset on each internal boundary
 * reads as the 2px gap the dataviz mark spec asks for between stacked fills.
 * Only the topmost segment in a stack gets the rounded data-end; the rest
 * stay square, same as every other bar in this file.
 */
export function StackedBarStrip({ buckets, series, formatTick, ariaLabel }: StackedBarStripProps) {
  const totals = buckets.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0));
  const domain = zeroDomain(totals);
  const [active, setActive] = useState<number | null>(null);

  return (
    <Plot
      count={buckets.length}
      domain={domain}
      spread="band"
      formatTick={formatTick}
      bandLabels={buckets.map((b) => b.label)}
      ariaLabel={ariaLabel}
    >
      {(frame) => {
        const width = Math.min(40, Math.max(10, frame.band - 8));
        return (
          <>
            {buckets.map((bucket, i) => {
              const x = frame.x(i) - width / 2;
              const present = series
                .map((def) => ({ def, value: bucket.segments.find((s) => s.key === def.key)?.value ?? 0 }))
                .filter((s) => s.value > 0);

              let cumulative = 0;
              return (
                <g key={i}>
                  {present.map(({ def, value }, si) => {
                    const bottomValue = cumulative;
                    cumulative += value;
                    const isBottom = si === 0;
                    const isTop = si === present.length - 1;
                    const top = frame.y(cumulative) + (isTop ? 0 : 1);
                    const base = frame.y(bottomValue) - (isBottom ? 0 : 1);
                    return (
                      <path
                        key={def.key}
                        className={active === i ? 'chart-bar-active' : undefined}
                        style={{ fill: def.color }}
                        d={isTop ? barPath(x, top, width, base, 4) : rectPath(x, top, width, base)}
                      />
                    );
                  })}
                  <BarHitTarget
                    x={frame.x(i)}
                    band={frame.band}
                    top={frame.y(domain[1])}
                    bottom={frame.base}
                    label={formatTick(totals[i] ?? 0)}
                    active={active === i}
                    onActivate={() => setActive(i)}
                    onDeactivate={() => setActive((a) => (a === i ? null : a))}
                  />
                </g>
              );
            })}
            {active !== null && totals[active] !== undefined && (
              <ValueFlag
                x={frame.x(active)}
                y={frame.y(totals[active])}
                left={frame.left}
                right={frame.right}
                text={formatTick(totals[active])}
              />
            )}
          </>
        );
      }}
    </Plot>
  );
}

/* -------------------------------------------------------------------------- */
/* Time-of-week map                                                            */
/* -------------------------------------------------------------------------- */

export type TimeMarker = {
  key: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Minutes from local midnight. */
  minutes: number;
  /** The glyph drawn at the point — an emoji or a single letter. */
  badge: string;
  /** What the flag shows when the marker is activated. Kept short: the flag is sized by character count, and a wide one crowds the plot. */
  label: string;
  /** What a screen reader hears instead — the same reading, with nothing abbreviated away. */
  ariaLabel: string;
};

/** The badge box, in user units — also the vertical gap two markers need before they read as separate. */
const MARKER = 12;
/** Taller than the strip charts: here the y axis is a whole day, not four bar heights. */
const MAP_HEIGHT = 208;
/** A clock time is wider than the compact numbers the strip charts label, and a clipped axis is worse than a narrower plot. */
const MAP_PAD_LEFT = 46;

/**
 * Whole-hour gridlines at a step that keeps the axis to about five labels —
 * every hour on a short span, every fourth on a full day, so the ticks stay
 * readable without the eye having to interpolate between two distant ones.
 */
function hourTicks([lo, hi]: [number, number]): number[] {
  const hours = (hi - lo) / 60;
  const step = (hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4) * 60;
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += step) ticks.push(m);
  return ticks;
}

type TimeOfWeekPlotProps = {
  markers: TimeMarker[];
  /** Minute bounds of the y axis — whole hours, so every tick lands on one. */
  domain: [number, number];
  /** Seven short weekday names, Monday first. */
  dayLabels: string[];
  formatTime: (minutes: number) => string;
  ariaLabel: string;
};

/**
 * A day-of-week × time-of-day grid with one badge per session — the shape of
 * a training week, which no bar chart can show: bars aggregate away exactly
 * the "Tuesday evening, Saturday morning" pattern this exists to expose.
 *
 * Markers that would overlap inside a day column are nudged sideways in
 * alternating steps rather than drawn on top of each other, so two trainings
 * an hour apart on the same weekday both stay readable. The nudge is
 * deterministic (the caller hands markers over in a stable order) and stays
 * inside the column, so a badge never drifts into the neighbouring day.
 */
export function TimeOfWeekPlot({ markers, domain, dayLabels, formatTime, ariaLabel }: TimeOfWeekPlotProps) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <Plot
      count={dayLabels.length}
      domain={domain}
      spread="band"
      height={MAP_HEIGHT}
      ticks={hourTicks(domain)}
      padLeft={MAP_PAD_LEFT}
      formatTick={formatTime}
      bandLabels={dayLabels}
      ariaLabel={ariaLabel}
    >
      {(frame) => {
        // Whole badge-widths inside one day, filled from the middle out. A
        // fixed set of lanes rather than a growing offset: a Tuesday-evening
        // habit produces a dozen markers at the same height, and anything
        // that keeps stepping outwards to fit them ends up drawing them over
        // the neighbouring day. Past the last free lane they overlap instead
        // — an unreadable pile still says "Tuesday evening"; a badge in the
        // wrong column says something false.
        const lanes = Math.max(1, Math.floor(frame.band / MARKER));
        const laneWidth = frame.band / lanes;
        const centre = (lanes - 1) / 2;
        const order = Array.from({ length: lanes }, (_, i) => i).sort(
          (a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b,
        );
        const taken = new Map<string, number[]>();

        const placed = markers.map((marker) => {
          const y = frame.y(marker.minutes);
          let lane = order[0] ?? 0;
          let widest = -1;
          for (const candidate of order) {
            const column = taken.get(`${marker.weekday}:${candidate}`) ?? [];
            const gap = column.reduce((min, placedY) => Math.min(min, Math.abs(placedY - y)), Infinity);
            if (gap >= MARKER) {
              lane = candidate;
              widest = Infinity;
              break;
            }
            // Nothing is free: remember the lane whose nearest neighbour is
            // furthest away, so the unavoidable overlap is the mildest one.
            if (gap > widest) {
              widest = gap;
              lane = candidate;
            }
          }
          const column = taken.get(`${marker.weekday}:${lane}`) ?? [];
          column.push(y);
          taken.set(`${marker.weekday}:${lane}`, column);
          return { marker, x: frame.x(marker.weekday) + (lane - centre) * laneWidth, y };
        });

        const activePoint = placed.find((p) => p.marker.key === active);

        return (
          <>
            {dayLabels.map((_, i) =>
              i === 0 ? null : (
                <line
                  key={i}
                  className="chart-grid chart-grid-faint"
                  x1={frame.x(i) - frame.band / 2}
                  x2={frame.x(i) - frame.band / 2}
                  y1={frame.y(domain[1])}
                  y2={frame.base}
                />
              ),
            )}

            {placed.map(({ marker, x, y }) => (
              <g key={marker.key}>
                <text
                  className={active === marker.key ? 'chart-badge chart-badge-active' : 'chart-badge'}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {marker.badge}
                </text>
                <rect
                  className="chart-hit"
                  x={x - MARKER / 2}
                  y={y - MARKER / 2}
                  width={MARKER}
                  height={MARKER}
                  tabIndex={0}
                  role="button"
                  aria-label={marker.ariaLabel}
                  aria-pressed={active === marker.key}
                  // Same activate-only handlers as BarHitTarget: a tap fires
                  // focus before click, so toggling would cancel itself out.
                  onClick={() => setActive(marker.key)}
                  onFocus={() => setActive(marker.key)}
                  onBlur={() => setActive((a) => (a === marker.key ? null : a))}
                />
              </g>
            ))}

            {activePoint && (
              <ValueFlag
                x={activePoint.x}
                y={activePoint.y - MARKER / 2}
                left={frame.left}
                right={frame.right}
                text={activePoint.marker.label}
              />
            )}
          </>
        );
      }}
    </Plot>
  );
}

/**
 * Legend for a multi-series chart — required whenever a chart has more than
 * one series (dataviz identity-never-color-alone rule), and doubles as the
 * "relief" numeric read-out for the categorical palette's sub-3:1 light-mode
 * slots: every swatch carries its value as real text, not just a colour.
 */
export function ChartLegend({ items }: { items: { key: string; label: string; color: string; value: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li className="chart-legend-item" key={item.key}>
          <span className="chart-legend-swatch" style={{ background: item.color }} aria-hidden="true" />
          <span className="chart-legend-label">{item.label}</span>
          <span className="chart-legend-value num">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export type BarListRow = {
  key: string;
  label: string;
  /** Bar length. Never negative. */
  value: number;
  /** Right-hand text — the value as the reader should read it. */
  valueLabel: string;
  /** Secondary line under the label. */
  note?: string;
};

/**
 * Ranked horizontal bars with their labels as real text.
 *
 * HTML rather than SVG on purpose: these categories have long names that must
 * wrap and stay selectable, and the list doubles as the table view for the
 * chart — every value is written out, so nothing is locked behind the picture.
 */
export function BarList({ rows }: { rows: BarListRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);

  return (
    <ul className="chart-list">
      {rows.map((row) => (
        <li className="chart-list-row" key={row.key}>
          <div className="chart-list-head">
            <span className="chart-list-label">{row.label}</span>
            <span className="chart-list-value num">{row.valueLabel}</span>
          </div>
          <div className="chart-list-track" aria-hidden="true">
            <div
              className="chart-list-fill"
              style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
            />
          </div>
          {row.note && <div className="chart-list-note">{row.note}</div>}
        </li>
      ))}
    </ul>
  );
}
