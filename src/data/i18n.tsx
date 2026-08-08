/**
 * UI language: English or Spanish. Exercise names, categories, equipment and
 * targets are excluded by design (SPEC §5.1) — they come from
 * data/exercises.json and stay English regardless of this setting.
 *
 * Persisted in localStorage, not the `settings` IndexedDB store — same
 * reasoning as theme.ts: localStorage is synchronous, so the language can be
 * applied before first paint (see the inline bootstrap script in index.html)
 * instead of the app briefly rendering in the wrong language while the
 * IndexedDB-backed store loads. Defaults to the browser/OS language when
 * nothing has been chosen yet, English otherwise.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { en, type TranslationKey } from './translations/en';
import { es } from './translations/es';

export type { TranslationKey };
export type Language = 'en' | 'es';

/** Keep this in sync with the inline bootstrap script in index.html. */
export const LANGUAGE_STORAGE_KEY = 'ander-gym-language';

/** BCP-47 tag for `toLocaleDateString` calls, keyed by app language — not the
 *  device locale, so date formatting follows the in-app choice, not the OS. */
export const LOCALE: Record<Language, string> = { en: 'en-US', es: 'es-ES' };

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, es };

type Vars = Record<string, string | number>;

function systemLanguage(): Language {
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** The language currently in effect: the stored override, or the OS preference. */
export function getLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'en' || stored === 'es' ? stored : systemLanguage();
}

/** Applies a language to the document without persisting it. */
export function applyLanguage(language: Language): void {
  document.documentElement.lang = language;
}

/** Persists an explicit choice and applies it immediately. */
export function setLanguage(language: Language): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  applyLanguage(language);
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export type TFunc = (key: TranslationKey, vars?: Vars) => string;

type LanguageContextValue = {
  language: Language;
  /** `LOCALE[language]`, for `toLocaleDateString` calls. */
  locale: string;
  setLanguage: (language: Language) => void;
  t: TFunc;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getLanguage());

  function changeLanguage(next: Language) {
    setLanguage(next);
    setLanguageState(next);
  }

  function t(key: TranslationKey, vars?: Vars): string {
    return interpolate(DICTIONARIES[language][key], vars);
  }

  return (
    <LanguageContext.Provider value={{ language, locale: LOCALE[language], setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/**
 * Translated equivalent of derive.ts's `formatDaysAgo` ('today' / '-1 day' /
 * '-N days'), for pages that have adopted i18n. Kept separate from derive.ts
 * rather than changing that function's signature, since not every page uses
 * this yet and derive.ts is meant to stay pure/UI-agnostic.
 */
export function daysAgoLabel(t: TFunc, days: number): string {
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.daysAgoOne');
  return t('common.daysAgoOther', { days });
}
