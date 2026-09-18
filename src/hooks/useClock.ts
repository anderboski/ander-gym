import { useEffect, useState } from 'react';

/**
 * Wall-clock milliseconds, re-read every `intervalMs` while `running`.
 *
 * iOS suspends timers in a backgrounded tab, so the value is also re-read on
 * `visibilitychange`: anything derived from it (an elapsed time, a rest
 * countdown) is computed from an absolute timestamp rather than counted, and
 * one read on the way back catches up however long the tab was away.
 */
export function useClock(intervalMs: number, running = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, running]);

  return nowMs;
}
