import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryBackend } from '../storage/backend';
import { getPrefs } from '../storage/prefs';
import { createStore } from '../storage/store';
import en from './en.json';
import fr from './fr.json';
import {
  detectLocale,
  formatDate,
  formatNumber,
  formatRelativeDate,
  getLocale,
  loadLocale,
  pluralCategory,
  resolveLocale,
  setLocale,
  subscribeLocale,
  t,
  translate,
  translateFrom,
  type Catalogue,
} from './i18n';
import { changeLocale, initLocale } from './locale';

const catalogues: Record<string, Catalogue> = { en, fr };

function placeholders(message: unknown): string[] {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  return (text.match(/\{\w+\}/g) || []).sort();
}

// French is a lazy chunk (S0.10): loaded once for the tests that use it.
beforeAll(() => loadLocale('fr'));
afterEach(() => setLocale('en'));

describe('catalogues', () => {
  it('have the same keys in en.json and fr.json', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  for (const locale of ['en', 'fr']) {
    it(`has no empty message and well-formed plural forms in ${locale}`, () => {
      for (const [key, message] of Object.entries(catalogues[locale])) {
        if (typeof message === 'string') {
          expect(message.trim(), key).not.toBe('');
        } else {
          expect(Object.keys(message).sort(), key).toEqual(['one', 'other']);
          expect(message.one && message.other, key).toBeTruthy();
        }
      }
    });
  }

  it('use the same kind of message and the same placeholders in every locale', () => {
    for (const key of Object.keys(en)) {
      const a = (en as Catalogue)[key];
      const b = (fr as Catalogue)[key];
      expect(typeof b, key).toBe(typeof a);
      expect(placeholders(b), key).toEqual(placeholders(a));
    }
  });
});

describe('translate', () => {
  it('interpolates parameters and formats numbers for the locale', () => {
    expect(translate('en', 'pager.status', { page: 2, count: 14 })).toBe('Page 2 of 14');
    expect(translate('fr', 'pager.status', { page: 2, count: 14 })).toBe('Page 2 sur 14');
    expect(translate('en', 'cover.by', { author: 'Infocom' })).toBe('by Infocom');
    expect(translate('fr', 'library.count', { count: 1234 })).toBe('1 234 aventures');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'cover.by', {})).toBe('by {author}');
  });

  it('applies English plural rules', () => {
    expect(translate('en', 'library.count', { count: 0 })).toBe('0 adventures');
    expect(translate('en', 'library.count', { count: 1 })).toBe('1 adventure');
    expect(translate('en', 'library.count', { count: 2 })).toBe('2 adventures');
  });

  it('applies French plural rules (0 and 1 are singular)', () => {
    expect(translate('fr', 'library.count', { count: 0 })).toBe('0 aventure');
    expect(translate('fr', 'library.count', { count: 1 })).toBe('1 aventure');
    expect(translate('fr', 'library.count', { count: 2 })).toBe('2 aventures');
  });

  it('falls back to English for a key missing in the locale, never to the raw key', () => {
    const partial: Catalogue = { 'a.plural': { one: '{count} chose', other: '{count} choses' } };
    const english: Catalogue = {
      'a.text': 'Hello {name}',
      'a.plural': { one: '{count} thing', other: '{count} things' },
    };
    expect(translateFrom(partial, english, 'fr', 'a.text', { name: 'Ada' })).toBe('Hello Ada');
    expect(translateFrom(partial, english, 'fr', 'a.plural', { count: 3 })).toBe('3 choses');
    expect(translateFrom(partial, english, 'fr', 'missing.everywhere')).toBe('');
  });

  it('uses "other" when count is missing', () => {
    expect(translate('en', 'library.count')).toBe('{count} adventures');
  });
});

describe('pluralCategory', () => {
  it('follows CLDR for EN and FR', () => {
    expect([0, 1, 1.5, 2].map((n) => pluralCategory('en', n))).toEqual([
      'other',
      'one',
      'other',
      'other',
    ]);
    expect([0, 1, 1.5, 2].map((n) => pluralCategory('fr', n))).toEqual([
      'one',
      'one',
      'one',
      'other',
    ]);
  });
});

describe('locale detection', () => {
  it('resolves tags to supported locales', () => {
    expect(resolveLocale('fr-FR')).toBe('fr');
    expect(resolveLocale('FR_ca')).toBe('fr');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('picks the first supported browser language', () => {
    expect(detectLocale({ languages: ['de-DE', 'fr-FR', 'en-US'], language: 'de-DE' })).toBe('fr');
    expect(detectLocale({ language: 'fr-BE' })).toBe('fr');
    expect(detectLocale({ userLanguage: 'fr' })).toBe('fr');
    expect(detectLocale({ languages: ['es'], language: 'it' })).toBe('en');
    expect(detectLocale({})).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });
});

describe('current locale', () => {
  it('switches t() and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocale(listener);
    expect(t('nav.library')).toBe('Library');
    setLocale('fr');
    expect(getLocale()).toBe('fr');
    expect(t('nav.library')).toBe('Bibliothèque');
    expect(document.documentElement.lang).toBe('fr');
    expect(listener).toHaveBeenCalledWith('fr');
    setLocale('fr');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('prefers the saved override over the browser language, and persists changes', () => {
    const store = createStore(new MemoryBackend());
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    expect(initLocale(store)).toBe('fr');

    expect(changeLocale(store, 'en')).toBe('en');
    expect(getPrefs(store)).toEqual({ locale: 'en' });
    expect(initLocale(store)).toBe('en');

    expect(changeLocale(store, undefined)).toBe('fr');
    expect(getPrefs(store)).toEqual({});
    languages.mockRestore();
  });

  it('ignores an unsupported saved locale', () => {
    const store = createStore(new MemoryBackend());
    store.set('prefs', { locale: 'xx' });
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    expect(initLocale(store)).toBe('en');
    languages.mockRestore();
  });
});

describe('French on demand (S0.10)', () => {
  /** A fresh copy of the module, French not loaded yet. */
  async function freshI18n() {
    vi.resetModules();
    return import('./i18n');
  }

  it('applies French once its dictionary is loaded, and English at once', async () => {
    const i18n = await freshI18n();
    const done = i18n.setLocale('fr');
    // Not loaded yet: the UI stays in English until it is.
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.t('nav.library')).toBe('Library');
    await done;
    await i18n.localeReady();
    expect(i18n.getLocale()).toBe('fr');
    expect(i18n.t('nav.library')).toBe('Bibliothèque');
    // English needs no load.
    expect(i18n.setLocale('en')).toBeInstanceOf(Promise);
    expect(i18n.getLocale()).toBe('en');
  });

  it('does not apply a French load that finishes after a switch back to English', async () => {
    const i18n = await freshI18n();
    const french = i18n.setLocale('fr');
    i18n.setLocale('en');
    await french;
    expect(i18n.getLocale()).toBe('en');
    // Loaded now: a later switch is immediate.
    i18n.setLocale('fr');
    expect(i18n.getLocale()).toBe('fr');
    i18n.setLocale('en');
  });
});

describe('formatting without Intl', () => {
  it('formats numbers', () => {
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
    expect(formatNumber(1234567.5, 'fr')).toBe('1 234 567,5');
    expect(formatNumber(-1000, 'en')).toBe('-1,000');
    expect(formatNumber(999, 'fr')).toBe('999');
    expect(formatNumber(3.14159, 'fr', 2)).toBe('3,14');
  });

  it('formats dates', () => {
    const date = new Date(2026, 8, 29, 18, 30);
    expect(formatDate(date, 'en')).toBe('29 September 2026');
    expect(formatDate(date, 'fr')).toBe('29 septembre 2026');
  });

  it('formats relative dates by calendar day', () => {
    const now = new Date(2026, 8, 29, 9, 0);
    expect(formatRelativeDate(new Date(2026, 8, 29, 1, 0), now, 'en')).toBe('today');
    expect(formatRelativeDate(new Date(2026, 8, 28, 23, 0), now, 'fr')).toBe('hier');
    expect(formatRelativeDate(new Date(2026, 8, 26), now, 'en')).toBe('3 days ago');
    expect(formatRelativeDate(new Date(2026, 8, 26), now, 'fr')).toBe('il y a 3 jours');
    expect(formatRelativeDate(new Date(2026, 7, 1), now, 'fr')).toBe('1 août 2026');
    expect(formatRelativeDate(new Date(2026, 9, 1), now, 'en')).toBe('today');
  });
});
