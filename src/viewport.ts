/**
 * Standalone viewport fix — SPEC §6.
 *
 * On iOS 26, a Home Screen web app with `viewport-fit=cover` and a translucent
 * status bar lays the page out shorter than the screen: the web view covers the
 * whole display, but the initial containing block (what `height: 100%` and
 * `position: fixed; bottom: 0` resolve against) comes up short by roughly the
 * top safe-area inset. The tab bar and every bottom sheet then float above an
 * empty strip. CSS can't see the missing height (`vh`, `dvh`, `lvh` all report
 * the short value), so measure it once and expose it as `--vp-gap` for the
 * shell and the bottom-anchored chrome to absorb.
 */

/** Largest gap we believe is the bug; anything bigger is some other layout (split view, landscape). */
const MAX_GAP = 120;

/**
 * How many CSS px the layout viewport falls short of the screen, or 0 when it
 * doesn't (Safari tab, older iOS, desktop) or the numbers don't look like the bug.
 */
export function viewportGap(
  screenHeight: number,
  innerHeight: number,
  innerWidth: number,
  standalone: boolean,
): number {
  if (!standalone) return 0;
  // iOS reports `screen.height` in portrait terms whatever the orientation, so
  // only compare when the window is portrait too.
  if (innerHeight <= innerWidth) return 0;
  const gap = Math.round(screenHeight - innerHeight);
  return gap > 0 && gap <= MAX_GAP ? gap : 0;
}

export function installViewportFix(): void {
  const standalone = window.matchMedia('(display-mode: standalone)');
  const apply = () => {
    const gap = viewportGap(window.screen.height, window.innerHeight, window.innerWidth, standalone.matches);
    document.documentElement.style.setProperty('--vp-gap', `${gap}px`);
  };
  apply();
  window.addEventListener('resize', apply);
}
