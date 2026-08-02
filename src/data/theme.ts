/**
 * Manual light/dark override, independent of the OS `prefers-color-scheme`.
 * See SPEC.md §5.1. Kept out of the `settings` IndexedDB store deliberately —
 * localStorage is synchronous, so the theme can be applied before first paint
 * (see the inline script in index.html) instead of flashing the wrong colours
 * while the IndexedDB-backed store loads.
 */

export type Theme = 'light' | 'dark';

/** Keep this in sync with the inline bootstrap script in index.html. */
export const THEME_STORAGE_KEY = 'ander-gym-theme';

const THEME_COLOR: Record<Theme, string> = { dark: '#0f1216', light: '#f7f8fa' };

export function otherTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light';
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The theme currently in effect: the stored override, or the OS preference. */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

/** Applies a theme to the document without persisting it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/** Persists an explicit choice and applies it immediately. */
export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}
