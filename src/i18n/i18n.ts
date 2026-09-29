// UI translations (SPEC §7): English and French, plural forms, locale detection and an optional user override.
// No reliance on Intl, which the Kindle browser may lack.
import { useEffect, useState } from 'preact/hooks';
import en from './en.json';
import fr from './fr.json';

export type Locale = 'en' | 'fr';

export const LOCALES: Locale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: Locale = 'en';

export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

/** Plural forms of a message, chosen by the `count` parameter (CLDR categories used by EN/FR). */
export interface PluralForms {
  one: string;
  other: string;
}

export type Message = string | PluralForms;
export type Catalogue = Record<string, Message>;

const catalogues: Record<Locale, Catalogue> = { en, fr };

let current: Locale = DEFAULT_LOCALE;
const listeners: Array<(locale: Locale) => void> = [];

function supported(tag: string | null | undefined): Locale | undefined {
  const base = (tag || '').toLowerCase().split(/[-_]/)[0];
  return LOCALES.indexOf(base as Locale) >= 0 ? (base as Locale) : undefined;
}

/** Maps a BCP 47 tag (`fr-CA`, `FR`, `en_US`…) to a supported locale; anything else is English. */
export function resolveLocale(tag: string | null | undefined): Locale {
  return supported(tag) || DEFAULT_LOCALE;
}

interface NavigatorLike {
  languages?: readonly string[];
  language?: string;
  userLanguage?: string;
}

/** Locale from the browser's preferred languages (first supported one wins). */
export function detectLocale(
  nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): Locale {
  if (!nav) return DEFAULT_LOCALE;
  const tags: string[] = [];
  if (nav.languages) for (let i = 0; i < nav.languages.length; i++) tags.push(nav.languages[i]);
  if (nav.language) tags.push(nav.language);
  if (nav.userLanguage) tags.push(nav.userLanguage);
  for (let i = 0; i < tags.length; i++) {
    const locale = supported(tags[i]);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/** CLDR plural category: English "one" is exactly 1; French "one" is 0 and 1 (and fractions below 2). */
export function pluralCategory(locale: Locale, count: number): keyof PluralForms {
  const n = Math.abs(count);
  if (locale === 'fr') return n < 2 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

function interpolate(template: string, params: Params | undefined, locale: Locale): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value, locale) : value;
  });
}

/**
 * Translates `key` from `catalogue`, falling back to `fallback` (English) for missing keys — never to the raw key.
 * Plural messages pick their form from the numeric `count` parameter.
 */
export function translateFrom(
  catalogue: Catalogue,
  fallback: Catalogue,
  locale: Locale,
  key: string,
  params?: Params,
): string {
  let message = catalogue[key] === undefined ? fallback[key] : catalogue[key];
  if (message === undefined) return '';
  if (typeof message !== 'string') {
    const count = params && typeof params.count === 'number' ? params.count : 0;
    message = message[pluralCategory(locale, count)] || message.other;
  }
  return interpolate(message, params, locale);
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return translateFrom(catalogues[locale], catalogues[DEFAULT_LOCALE], locale, key, params);
}

export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params);
}

export function getLocale(): Locale {
  return current;
}

/** Switches the UI language and notifies subscribers (the app re-renders through `useLocale`). */
export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (let i = 0; i < listeners.length; i++) listeners[i](locale);
}

export function subscribeLocale(listener: (locale: Locale) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/** Current locale as component state: the component re-renders (with its children) when the locale changes. */
export function useLocale(): Locale {
  const [locale, setState] = useState(current);
  useEffect(() => subscribeLocale(setState), []);
  return locale;
}

// --- Formatting helpers (no Intl) -------------------------------------------------------------

const GROUP: Record<Locale, string> = { en: ',', fr: '\u202f' };
const DECIMAL: Record<Locale, string> = { en: '.', fr: ',' };

const MONTHS: Record<Locale, string[]> = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  fr: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
};

/** 12345.6 → "12,345.6" (en) / "12 345,6" (fr, narrow no-break space). */
export function formatNumber(
  value: number,
  locale: Locale = current,
  fractionDigits?: number,
): string {
  const fixed =
    fractionDigits === undefined
      ? String(Math.abs(value))
      : Math.abs(value).toFixed(fractionDigits);
  const parts = fixed.split('.');
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[locale]);
  return (value < 0 ? '-' : '') + integer + (parts[1] ? DECIMAL[locale] + parts[1] : '');
}

/** "29 September 2026" (en) / "29 septembre 2026" (fr), in local time. */
export function formatDate(date: Date, locale: Locale = current): string {
  return date.getDate() + ' ' + MONTHS[locale][date.getMonth()] + ' ' + date.getFullYear();
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday", "3 days ago", then the full date after 30 days. */
export function formatRelativeDate(
  date: Date,
  now: Date = new Date(),
  locale: Locale = current,
): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return translate(locale, 'time.today');
  if (days === 1) return translate(locale, 'time.yesterday');
  if (days <= 30) return translate(locale, 'time.daysAgo', { count: days });
  return formatDate(date, locale);
}
