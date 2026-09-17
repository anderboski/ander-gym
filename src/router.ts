/**
 * Hash router.
 *
 * Hash routing (rather than history/pushState) is deliberate: GitHub Pages has
 * no server-side rewrite, so a deep link like /ander-gym/trainings/leg-abs would
 * 404 on reload. With `#/trainings/leg-abs` every URL resolves to index.html.
 *
 * `parseRoute` and `tabOf` are pure and unit-tested; the hooks below are the
 * only place the window is touched.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'stats' }
  | { name: 'profile' }
  | { name: 'help' }
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
    case 'help':
      return { name: 'help' };
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
    case 'help':
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

/** The current route. Re-renders on navigation. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getSnapshot, () => '/'));
}

/** Push a new entry. `navigate('/trainings/leg-abs')` */
export function navigate(path: string): void {
  if (getSnapshot() === path) return;
  window.location.hash = path;
}
