import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * State that clears itself back to null `durationMs` after it was last set —
 * a toast, an undo offer, a "new PR" flash. Setting a fresh value restarts the
 * timer; setting null cancels it. Each value is a new object per set, so two
 * identical toasts in a row still restart the countdown.
 */
export function useTransient<T>(durationMs: number): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    if (value === null) return;
    const id = window.setTimeout(() => setValue(null), durationMs);
    return () => window.clearTimeout(id);
  }, [value, durationMs]);

  return [value, setValue];
}
