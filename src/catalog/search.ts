// Catalogue search (story S3.1): accent- and case-insensitive match on title and author, and paging of the results.
// No String.prototype.normalize on the Kindle browser, so accents are folded with a table.
import type { IndexRow } from '../../scripts/catalog/emitter';

const FOLD: Record<string, string> = {};
function fold(chars: string, base: string) {
  for (let i = 0; i < chars.length; i++) FOLD[chars.charAt(i)] = base;
}
fold('àáâãäåāăą', 'a');
fold('çćĉċč', 'c');
fold('ďđ', 'd');
fold('èéêëēĕėęě', 'e');
fold('ĝğġģ', 'g');
fold('ĥħ', 'h');
fold('ìíîïĩīĭįı', 'i');
fold('ĵ', 'j');
fold('ķ', 'k');
fold('ĺļľŀł', 'l');
fold('ñńņňŉ', 'n');
fold('òóôõöøōŏő', 'o');
fold('ŕŗř', 'r');
fold('śŝşšș', 's');
fold('ţťŧț', 't');
fold('ùúûüũūŭůűų', 'u');
fold('ŵ', 'w');
fold('ýÿŷ', 'y');
fold('źżž', 'z');
FOLD['æ'] = 'ae';
FOLD['œ'] = 'oe';
FOLD['ß'] = 'ss';
FOLD['þ'] = 'th';
FOLD['ð'] = 'd';

/** Latin-1 symbols (« » ¿ ¡ …), general punctuation (— ’ “ …) and CJK punctuation: separators, like ASCII ones. */
const PUNCTUATION = /[\u00a0-\u00bf\u00d7\u00f7\u2000-\u206f\u3000-\u303f]/;

/** Lower case, accents folded, punctuation turned into spaces, spaces collapsed. */
export function normalize(text: string): string {
  const lower = text.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const c = lower.charAt(i);
    const folded = FOLD[c];
    if (folded) out += folded;
    else if (/[a-z0-9]/.test(c) || (c.charCodeAt(0) > 127 && !PUNCTUATION.test(c))) out += c;
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').replace(/^ | $/g, '');
}

/** What a query is matched against: title and author. */
export function searchKey(row: IndexRow): string {
  return ' ' + normalize(row.n + ' ' + row.a) + ' ';
}

/**
 * Indices of the rows matching every word of `query`, each word at the start of a word of the title or author
 * ("lamp" finds "The Lamp at Saltmere", "mp" does not). Title matches come before author-only matches; the index
 * order (by title) is kept within each group. An empty query matches everything.
 */
export function search(rows: IndexRow[], keys: string[], query: string): number[] {
  const words = normalize(query)
    .split(' ')
    .filter((word) => word.length > 0);
  if (!words.length) return rows.map((_, i) => i);
  const inTitle: number[] = [];
  const byAuthor: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    let all = true;
    for (let w = 0; w < words.length && all; w++) all = keys[i].indexOf(' ' + words[w]) >= 0;
    if (!all) continue;
    const title = ' ' + normalize(rows[i].n) + ' ';
    let titleOnly = true;
    for (let w = 0; w < words.length && titleOnly; w++)
      titleOnly = title.indexOf(' ' + words[w]) >= 0;
    (titleOnly ? inTitle : byAuthor).push(i);
  }
  return inTitle.concat(byAuthor);
}

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to the existing pages. */
  page: number;
  pageCount: number;
}

export function paginate<T>(items: T[], page: number, perPage: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(Math.floor(page) || 1, 1), pageCount);
  return {
    items: items.slice((current - 1) * perPage, current * perPage),
    page: current,
    pageCount: pageCount,
  };
}
