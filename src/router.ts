/**
 * Hash router.
 *
 * Hash routing (rather than history/pushState) is deliberate: GitHub Pages has
 * no server-side rewrite, so a deep link like /ander-gym/trainings/leg-abs would
 * 404 on reload. With `#/trainings/leg-abs` every URL resolves to index.html.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'stats' }
  | { name: 'profile' }
  | { name: 'exercises' }
  | { name: 'trainings' }
  | { name: 'training'; id: string }
  | { name: 'session' }
  | { name: 'history' }
  | { name: 'historyDetail'; id: string };

/** The five tab roots. A route's tab is what the tab bar highlights. */
export type TabName = 'home' | 'exercises' | 'trainings' | 'session' | 'history';

export const TAB_PATHS: Record<TabName, string> = {
  home: '/home',
  exercises: '/exercises',
  trainings: '/trainings',
  session: '/session',
  history: '/history',
};

export function parseRoute(path: string): Route {
  const parts = path.split('/').filter(Boolean);
  const [head, id] = parts;

  switch (head) {
    case undefined:
    case 'home':
      return { name: 'home' };
    case 'stats':
      return { name: 'stats' };
    case 'profile':
      return { name: 'profile' };
    case 'exercises':
      return { name: 'exercises' };
    case 'trainings':
      return id ? { name: 'training', id: decodeURIComponent(id) } : { name: 'trainings' };
    case 'session':
      return { name: 'session' };
    case 'history':
      return id ? { name: 'historyDetail', id: decodeURIComponent(id) } : { name: 'history' };
    default:
      return { name: 'home' };
  }
}

/**
 * Detail routes report the tab they were pushed from — D1 locks the bar at
 * five, so a push view lights its parent tab rather than adding a sixth.
 */
export function tabOf(route: Route): TabName {
  switch (route.name) {
    case 'training':
      return 'trainings';
    case 'historyDetail':
      return 'history';
    case 'stats':
    case 'profile':
      return 'home';
    default:
      return route.name;
  }
}

/* -------------------------------------------------------------------------- */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash.slice(1) || '/';
}

/** Current path, e.g. `/trainings/leg-abs`. Re-renders on navigation. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => '/');
}

export function useRoute(): Route {
  return parseRoute(usePath());
}

/** Push a new entry. `navigate('/trainings/leg-abs')` */
export function navigate(path: string): void {
  if (getSnapshot() === path) return;
  window.location.hash = path;
}

/** Replace the current entry — use when a redirect shouldn't be re-enterable. */
export function replace(path: string): void {
  window.history.replaceState(null, '', `#${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function back(): void {
  window.history.back();
}
