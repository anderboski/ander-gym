import { useState } from 'react';
import type { Exercise } from '../data/types';

/**
 * An exercise's picture, or its initial on a tinted tile when there is no
 * photo (a custom exercise) or the image is not in the offline cache. The
 * fallback is the same tile in both cases so a missing image never breaks a
 * row; the caller sizes it through `className`.
 */
export function ExerciseThumb({
  exercise,
  name,
  className,
}: {
  exercise: Exercise | undefined;
  /** The display name, for the initial. */
  name: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = exercise?.imageUrl ?? null;
  const classes = className ? `ex-thumb ${className}` : 'ex-thumb';

  if (!url || broken) {
    return (
      <span className={`${classes} ex-thumb-letter`} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={classes}>
      <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </span>
  );
}
