import type { ReactNode } from 'react';

/** A row of figures that wraps rather than scrolls — sets · volume · duration, age · height · BMI. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="stat-row">{children}</div>;
}

/** One figure with its label underneath. */
export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value num">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  );
}
