import { navigate } from '../router';
import { ChevronLeftIcon } from './icons';

/**
 * The back affordance every push view shares: chevron + the parent's name,
 * 44px tall, ink aligned with the page padding. `to` is the parent route.
 */
export function BackButton({ to, label, ariaLabel }: { to: string; label: string; ariaLabel?: string }) {
  return (
    <button type="button" className="back-btn" onClick={() => navigate(to)} aria-label={ariaLabel}>
      <ChevronLeftIcon />
      <span>{label}</span>
    </button>
  );
}
