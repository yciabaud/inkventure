// ebook/books.json (story S6.3): what the download page lists. Stable file names, without a version, so links
// shared elsewhere keep working: inkventure-<locale>.epub / .azw3, and a cover thumbnail per locale.
import { FORMATS, type BookFile, type BooksManifest } from '../../src/ebook-page/page.ts';

export function bookFileName(locale: string, format: string): string {
  return 'inkventure-' + locale + '.' + format;
}

export function coverFileName(locale: string): string {
  return 'inkventure-' + locale + '-cover.jpg';
}

/**
 * The manifest for the files found in the output folder (`sizes`: bytes by file name). Missing files are left out,
 * so the page shows them as not available.
 */
export function booksManifest(
  sizes: Record<string, number>,
  locales: string[],
  info: { built: string; commit: string },
): BooksManifest {
  const books: BookFile[] = [];
  const covers: Record<string, string> = {};
  for (const locale of locales) {
    for (const format of FORMATS) {
      const file = bookFileName(locale, format);
      if (sizes[file] === undefined) continue;
      books.push({
        locale,
        format,
        file,
        size: sizes[file],
        built: info.built,
        commit: info.commit,
      });
    }
    if (sizes[coverFileName(locale)] !== undefined) covers[locale] = coverFileName(locale);
  }
  return { built: info.built, commit: info.commit, books, covers };
}
