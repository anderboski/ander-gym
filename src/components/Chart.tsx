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
import type { ReactNode } from 'react';
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
  children: (frame: Frame) => ReactNode;
};

function Plot({ count, domain, spread, formatTick, xLabels, bandLabels, ariaLabel, children }: PlotProps) {
  const left = PAD.left;
  const right = BOX.w - PAD.right;
  const top = PAD.top;
  const bottom = BOX.h - PAD.bottom;

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
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {domain.map((value) => (
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
          <text key={i} className="chart-tick" x={frame.x(i)} y={BOX.h - 4} textAnchor="middle">
            {label}
          </text>
        ))
      ) : (
        xLabels && (
          <>
            <text className="chart-tick" x={left} y={BOX.h - 4} textAnchor="start">
              {xLabels[0]}
            </text>
            <text className="chart-tick" x={right} y={BOX.h - 4} textAnchor="end">
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
              return (
                <path
                  key={i}
                  // An empty week is drawn as a stub rather than nothing at all,
                  // so a gap in training reads as zero and not as missing data.
                  className={empty ? 'chart-bar chart-bar-empty' : dim ? 'chart-bar chart-bar-dim' : 'chart-bar'}
                  d={barPath(x, top, width, frame.base, 4)}
                />
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
              return present.map(({ def, value }, si) => {
                const bottomValue = cumulative;
                cumulative += value;
                const isBottom = si === 0;
                const isTop = si === present.length - 1;
                const top = frame.y(cumulative) + (isTop ? 0 : 1);
                const base = frame.y(bottomValue) - (isBottom ? 0 : 1);
                return (
                  <path
                    key={`${i}-${def.key}`}
                    style={{ fill: def.color }}
                    d={isTop ? barPath(x, top, width, base, 4) : rectPath(x, top, width, base)}
                  />
                );
              });
            })}
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
