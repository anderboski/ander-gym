import { describe, expect, it } from 'vitest';
import { viewportGap } from './viewport';

describe('viewportGap', () => {
  it('measures the shortfall of an iOS 26 standalone layout viewport', () => {
    // iPhone 16 Pro: 874 pt screen, page laid out 62 pt short (the top inset).
    expect(viewportGap(874, 812, 402, true)).toBe(62);
  });

  it('is zero when the layout viewport already fills the screen', () => {
    expect(viewportGap(874, 874, 402, true)).toBe(0);
  });

  it('is zero in a Safari tab, where browser chrome legitimately takes space', () => {
    expect(viewportGap(874, 700, 402, false)).toBe(0);
  });

  it('is zero in landscape, where screen.height still reports the portrait height', () => {
    expect(viewportGap(874, 402, 874, true)).toBe(0);
  });

  it('ignores gaps too large to be the bug', () => {
    expect(viewportGap(1366, 900, 700, true)).toBe(0);
  });
});
