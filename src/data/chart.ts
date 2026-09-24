/**
 * Pure geometry behind components/Chart.tsx — axis domains, tick steps and
 * marker lane assignment. Kept out of the component so it can be unit-tested
 * in Node without rendering an SVG.
 */

/** Rounds a rough interval up to a 1/2/5 × 10ⁿ step, so axis labels read cleanly. */
export function niceStep(rough: number): number {
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

/**
 * Whole-hour gridlines at a step that keeps the axis to about five labels —
 * every hour on a short span, every fourth on a full day, so the ticks stay
 * readable without the eye having to interpolate between two distant ones.
 */
export function hourTicks([lo, hi]: [number, number]): number[] {
  const hours = (hi - lo) / 60;
  const step = (hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4) * 60;
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += step) ticks.push(m);
  return ticks;
}

/** A marker to place: which column it belongs to and its vertical position. */
export type LaneItem = { column: number; y: number };

/**
 * Assigns each marker a lane inside its column so that markers closer than
 * `minGap` vertically do not sit on top of each other. Lanes are filled from
 * the middle out; past the last free lane the marker takes the lane whose
 * nearest neighbour is furthest away, so the unavoidable overlap is the mildest
 * one. Deterministic: items are placed in the order given.
 *
 * Returns one lane index per item, position-aligned with the input.
 */
export function assignLanes(items: readonly LaneItem[], lanes: number, minGap: number): number[] {
  const count = Math.max(1, lanes);
  const centre = (count - 1) / 2;
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b,
  );
  const taken = new Map<string, number[]>();

  return items.map((item) => {
    let lane = order[0] ?? 0;
    let widest = -1;
    for (const candidate of order) {
      const column = taken.get(`${item.column}:${candidate}`) ?? [];
      const gap = column.reduce((min, placedY) => Math.min(min, Math.abs(placedY - item.y)), Infinity);
      if (gap >= minGap) {
        lane = candidate;
        break;
      }
      if (gap > widest) {
        widest = gap;
        lane = candidate;
      }
    }
    const column = taken.get(`${item.column}:${lane}`) ?? [];
    column.push(item.y);
    taken.set(`${item.column}:${lane}`, column);
    return lane;
  });
}

export type Point = { x: number; y: number };

/**
 * SVG path through `points` (ascending x) as a smooth curve that never
 * overshoots: monotone cubic interpolation (Fritsch–Carlson). A plain
 * Catmull-Rom bulges past a local peak, and on a sparkline whose axis is
 * exactly the data's min and max that bulge would leave the plot — and
 * suggest a reading nobody logged.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  const first = points[0];
  if (!first) return '';
  if (n === 1) return `M${first.x} ${first.y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    dx.push(b.x - a.x);
    slope.push(dx[i] === 0 ? 0 : (b.y - a.y) / (b.x - a.x));
  }

  // Tangent at each point: the average of the two neighbouring secants, zeroed
  // at a local extreme so the curve flattens there instead of overshooting.
  const tangent: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1] ?? 0;
    const s1 = slope[i] ?? 0;
    tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2);
  }
  tangent.push(slope[n - 2] ?? 0);

  // Fritsch–Carlson limiter: keeps each segment inside its own endpoints.
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] ?? 0;
    if (s === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = (tangent[i] ?? 0) / s;
    const b = (tangent[i + 1] ?? 0) / s;
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      tangent[i] = k * a * s;
      tangent[i + 1] = k * b * s;
    }
  }

  let d = `M${first.x} ${first.y}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const third = (dx[i] ?? 0) / 3;
    d += ` C${a.x + third} ${a.y + (tangent[i] ?? 0) * third} ${b.x - third} ${b.y - (tangent[i + 1] ?? 0) * third} ${b.x} ${b.y}`;
  }
  return d;
}
