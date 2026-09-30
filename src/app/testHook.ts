import { getLocale, type Locale } from '../i18n/i18n';
import { changeLocale } from '../i18n/locale';
import { getPrefs, getStore, setPrefs, type Prefs } from '../storage';

declare global {
  interface Window {
    /** Debug / e2e hook: prefs and UI locale without going through the Settings screen. */
    __inkventure?: {
      getPrefs(): Prefs;
      setPrefs(patch: Partial<Prefs>): Prefs;
      persistent: boolean;
      getLocale(): Locale;
      changeLocale(locale: Locale | undefined): Locale;
    };
  }
}

export function installTestHook() {
  const store = getStore();
  window.__inkventure = {
    getPrefs: () => getPrefs(store),
    setPrefs: (patch) => setPrefs(store, patch),
    persistent: store.persistent,
    getLocale,
    changeLocale: (locale) => changeLocale(store, locale),
  };
}
