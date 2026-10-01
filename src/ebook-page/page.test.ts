import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import {
  formatSize,
  pageModel,
  parseManifest,
  pickLocale,
  render,
  type BooksManifest,
  type Strings,
} from './page';

// The page only reads its ebookPage.* strings (plural objects among the others are never looked up).
const all = { en, fr } as unknown as Record<string, Strings>;
const LOCALES = ['en', 'fr'];
const BUILT = '2026-10-01T12:00:00.000Z';

function book(locale: string, format: string, size: number) {
  return {
    locale,
    format,
    file: 'inkventure-' + locale + '.' + format,
    size,
    built: BUILT,
    commit: 'abc',
  };
}

const MANIFEST: BooksManifest = {
  built: BUILT,
  commit: 'abc',
  books: [book('en', 'epub', 350_000), book('en', 'azw3', 1_300_000), book('fr', 'epub', 360_000)],
  covers: { fr: 'inkventure-fr-cover.jpg' },
};

describe('the ebook page', () => {
  it('follows the language asked for, else the browser, else English', () => {
    expect(pickLocale('fr', ['en-US'], LOCALES)).toBe('fr');
    expect(pickLocale('de', ['fr-CA', 'en'], LOCALES)).toBe('fr');
    expect(pickLocale(null, ['de-DE', 'EN-gb'], LOCALES)).toBe('en');
    expect(pickLocale(null, ['de'], LOCALES)).toBe('en');
  });

  it('puts the book in the page language first', () => {
    expect(pageModel(MANIFEST, all.fr, 'fr', LOCALES).blocks.map((b) => b.locale)).toEqual([
      'fr',
      'en',
    ]);
    expect(pageModel(MANIFEST, all.en, 'en', LOCALES).blocks.map((b) => b.locale)).toEqual([
      'en',
      'fr',
    ]);
  });

  it('gives each format a download button with its size and build date', () => {
    const model = pageModel(MANIFEST, all.en, 'en', LOCALES);
    expect(model.available).toBe(true);
    const english = model.blocks[0];
    expect(english.title).toBe('English edition');
    expect(english.buttons.map((b) => b.label)).toEqual(['Download EPUB', 'Download AZW3']);
    expect(english.buttons[0].href).toBe('inkventure-en.epub');
    expect(english.buttons[0].info).toBe('342 KB, built on October 1, 2026');
    expect(english.buttons[1].info).toBe('1.2 MB, built on October 1, 2026');
    expect(model.blocks[1].cover).toBe('inkventure-fr-cover.jpg');
    expect(english.cover).toBeUndefined();
  });

  it('writes sizes and dates in French', () => {
    const french = pageModel(MANIFEST, all.fr, 'fr', LOCALES).blocks[1];
    expect(french.buttons[1].label).toBe('Télécharger en AZW3');
    expect(french.buttons[1].info).toBe('1,2 Mo, créé le 1 octobre 2026');
    expect(formatSize(100, all.fr)).toBe('1 Ko');
  });

  it('marks a missing file as not available', () => {
    const french = pageModel(MANIFEST, all.en, 'en', LOCALES).blocks[1];
    expect(french.buttons[0].href).toBe('inkventure-fr.epub');
    expect(french.buttons[1].href).toBeUndefined();
  });

  it('says the books are not available without books.json', () => {
    for (const text of [null, '', 'not json', '<!doctype html>', '{"books":3}']) {
      const model = pageModel(parseManifest(text), all.en, 'en', LOCALES);
      expect(model.available, String(text)).toBe(false);
      expect(model.blocks.every((b) => b.buttons.every((button) => !button.href))).toBe(true);
    }
    expect(parseManifest(JSON.stringify(MANIFEST))).toEqual(MANIFEST);
  });

  it('draws the blocks, the language switch and the "not available" notices', () => {
    const root = document.createElement('div');
    render(root, pageModel(MANIFEST, all.en, 'en', LOCALES), all);
    expect(root.querySelector('h1')!.textContent).toBe('The Inkventure ebook');
    const languages = Array.from(root.querySelectorAll('.language')).map((a) =>
      a.getAttribute('href'),
    );
    expect(languages).toEqual(['?lang=en', '?lang=fr']);
    expect(root.querySelectorAll('a.button[download]').length).toBe(3);
    expect(root.querySelectorAll('.button--disabled').length).toBe(1);
    expect(root.querySelector('.unavailable')).toBeNull();

    render(root, pageModel(null, all.fr, 'fr', LOCALES), all);
    expect(root.querySelector('.unavailable')!.textContent).toContain('pas disponibles');
    expect(root.querySelectorAll('a.button[download]').length).toBe(0);
  });
});
