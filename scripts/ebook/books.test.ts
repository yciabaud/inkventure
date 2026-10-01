import { describe, expect, it } from 'vitest';
import { bookFileName, booksManifest, coverFileName } from './books';

const INFO = { built: '2026-10-01T12:00:00.000Z', commit: 'abc123' };

describe('books.json', () => {
  it('names the files without a version', () => {
    expect(bookFileName('fr', 'azw3')).toBe('inkventure-fr.azw3');
    expect(coverFileName('en')).toBe('inkventure-en-cover.jpg');
  });

  it('lists each book with its locale, format, size, build date and commit', () => {
    const manifest = booksManifest(
      {
        'inkventure-en.epub': 1000,
        'inkventure-en.azw3': 2000,
        'inkventure-en-cover.jpg': 30,
        'inkventure-fr.epub': 1100,
        'inkventure-fr.azw3': 2100,
        'books.json': 10,
      },
      ['en', 'fr'],
      INFO,
    );
    expect(manifest.built).toBe(INFO.built);
    expect(manifest.commit).toBe(INFO.commit);
    expect(manifest.books).toEqual([
      { locale: 'en', format: 'epub', file: 'inkventure-en.epub', size: 1000, ...INFO },
      { locale: 'en', format: 'azw3', file: 'inkventure-en.azw3', size: 2000, ...INFO },
      { locale: 'fr', format: 'epub', file: 'inkventure-fr.epub', size: 1100, ...INFO },
      { locale: 'fr', format: 'azw3', file: 'inkventure-fr.azw3', size: 2100, ...INFO },
    ]);
    expect(manifest.covers).toEqual({ en: 'inkventure-en-cover.jpg' });
  });

  it('leaves out missing files', () => {
    const manifest = booksManifest({ 'inkventure-fr.epub': 5 }, ['en', 'fr'], INFO);
    expect(manifest.books.map((book) => book.file)).toEqual(['inkventure-fr.epub']);
    expect(booksManifest({}, ['en', 'fr'], INFO).books).toEqual([]);
  });
});
