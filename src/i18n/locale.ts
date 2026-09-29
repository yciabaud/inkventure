// Ties the UI locale to the stored preference (SPEC §7): an explicit choice wins over the browser language.
import { getPrefs, setPrefs, type Store } from '../storage';
import { detectLocale, LOCALES, setLocale, type Locale } from './i18n';

function storedLocale(store: Store): Locale | undefined {
  const locale = getPrefs(store).locale;
  return LOCALES.indexOf(locale as Locale) >= 0 ? (locale as Locale) : undefined;
}

/** Applies the saved override, or the browser's language, before the first render. */
export function initLocale(store: Store): Locale {
  const locale = storedLocale(store) || detectLocale();
  setLocale(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  return locale;
}

/** Saves the user's choice (`undefined` = follow the browser again) and applies it. Used by Settings (S5.1). */
export function changeLocale(store: Store, locale: Locale | undefined): Locale {
  setPrefs(store, { locale });
  return initLocale(store);
}
