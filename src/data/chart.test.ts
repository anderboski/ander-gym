import { describe, expect, it } from 'vitest';
import { assignLanes, hourTicks, monotonePath, niceStep, paddedDomain, zeroDomain } from './chart';

describe('niceStep', () => {
  it('rounds up to a 1/2/5 × 10ⁿ step', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
    expect(niceStep(2500)).toBe(5000);
  });

  it('is 1 for anything that is not a positive number', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
});

describe('zeroDomain', () => {
  it('is always anchored at zero', () => {
    expect(zeroDomain([30, 40])[0]).toBe(0);
  });

  it('tops small whole counts out at exactly the max', () => {
    expect(zeroDomain([1, 3, 2])).toEqual([0, 3]);
    expect(zeroDomain([8])).toEqual([0, 8]);
  });

  it('rounds larger or fractional values up to a nice bound', () => {
    expect(zeroDomain([9])).toEqual([0, 10]);
    expect(zeroDomain([2.5])).toEqual([0, 4]);
    expect(zeroDomain([840, 4200])).toEqual([0, 5000]);
  });

  it('gives an empty or all-zero strip a unit height', () => {
    expect(zeroDomain([])).toEqual([0, 1]);
    expect(zeroDomain([0, 0])).toEqual([0, 1]);
  });
});

describe('paddedDomain', () => {
  it('pads around the data rather than starting at zero', () => {
    const [lo, hi] = paddedDomain([30, 32.5]);
    expect(lo).toBeLessThan(30);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(32.5);
  });

  it('lands on nice values', () => {
    expect(paddedDomain([77.9, 78.4])).toEqual([77.5, 78.5]);
  });

  it('gives a flat series some height', () => {
    const [lo, hi] = paddedDomain([50, 50, 50]);
    expect(hi - lo).toBeGreaterThan(0);
    expect(lo).toBeLessThanOrEqual(50);
    expect(hi).toBeGreaterThanOrEqual(50);
  });

  it('is a unit range with no data', () => {
    expect(paddedDomain([])).toEqual([0, 1]);
  });
});

describe('hourTicks', () => {
  it('ticks every hour on a short span', () => {
    expect(hourTicks([6 * 60, 12 * 60])).toEqual([360, 420, 480, 540, 600, 660, 720]);
  });

  it('spaces ticks out as the span grows, staying around five labels', () => {
    expect(hourTicks([6 * 60, 18 * 60])).toHaveLength(7);
    expect(hourTicks([0, 24 * 60])).toEqual([0, 240, 480, 720, 960, 1200, 1440]);
  });
});

describe('assignLanes', () => {
  it('starts in the middle lane', () => {
    expect(assignLanes([{ column: 0, y: 10 }], 3, 12)).toEqual([1]);
    expect(assignLanes([{ column: 0, y: 10 }], 4, 12)).toEqual([1]);
  });

  it('keeps markers far enough apart in the same lane', () => {
    expect(assignLanes([{ column: 0, y: 10 }, { column: 0, y: 40 }], 3, 12)).toEqual([1, 1]);
  });

  it('moves a colliding marker to the nearest free lane', () => {
    expect(assignLanes([{ column: 0, y: 10 }, { column: 0, y: 14 }, { column: 0, y: 12 }], 3, 12)).toEqual([1, 0, 2]);
  });

  it('never lets a column affect another column', () => {
    expect(assignLanes([{ column: 0, y: 10 }, { column: 1, y: 10 }], 3, 12)).toEqual([1, 1]);
  });

  it('overlaps in the least crowded lane once every lane is taken', () => {
    const items = [
      { column: 0, y: 10 },
      { column: 0, y: 10 },
      { column: 0, y: 10 },
      { column: 0, y: 21 }, // closer to the middle lane's only marker than any other lane's? all equal — falls back to the first candidate with the widest gap
    ];
    const lanes = assignLanes(items, 3, 12);
    expect(lanes.slice(0, 3).sort()).toEqual([0, 1, 2]);
    expect([0, 1, 2]).toContain(lanes[3]);
  });

  it('copes with a single lane', () => {
    expect(assignLanes([{ column: 0, y: 1 }, { column: 0, y: 2 }], 1, 12)).toEqual([0, 0]);
  });
});

describe('monotonePath', () => {
  /** Control-point y values out of a path, for bounds checks. */
  function ys(path: string): number[] {
    const nums = path.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
    return nums.filter((_, i) => i % 2 === 1);
  }

  it('is empty for no points and a bare move for one', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 5, y: 7 }])).toBe('M5 7');
  });

  it('draws one cubic segment per gap', () => {
    const path = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ]);
    expect(path.match(/C/g)).toHaveLength(2);
  });

  it('never overshoots the data range', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 9 },
      { x: 40, y: 0 },
    ];
    for (const y of ys(monotonePath(points))) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
  });

  it('keeps a flat run flat', () => {
    const path = monotonePath([
      { x: 0, y: 4 },
      { x: 10, y: 4 },
      { x: 20, y: 4 },
    ]);
    expect(new Set(ys(path))).toEqual(new Set([4]));
  });
});
