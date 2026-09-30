// Library filters and sorting (SPEC §3.4; story S3.2): the state kept in the URL hash, the predicates, the sort
// comparators and the facet options. Pure, so the Library screen only wires it to the router.
import type { IndexRow, Meta } from '../../scripts/catalog/emitter';

export type SortKey = 'rating' | 'votes' | 'new' | 'title';
export const SORTS: SortKey[] = ['rating', 'votes', 'new', 'title'];
/** Best rated first: the most useful order to browse the whole catalogue. */
export const DEFAULT_SORT: SortKey = 'rating';

/** Play time buckets (SPEC §3.4): < 30 min, 30 min–1 h, 1–2 h, 2 h+. */
export type PlayTime = 'short' | 'medium' | 'long' | 'epic';
export const PLAY_TIMES: PlayTime[] = ['short', 'medium', 'long', 'epic'];

/** IFDB forgiveness ratings, most to least forgiving. */
export const FORGIVENESS = ['merciful', 'polite', 'tough', 'nasty', 'cruel'];

/** Choices of the minimum rating (stars) and minimum number of ratings. */
export const MIN_RATINGS = [3, 3.5, 4, 4.5];
export const MIN_VOTES = [5, 10, 25, 50];

export interface Filters {
  /** Any of these genres (case-insensitive). */
  genres: string[];
  /** Any of these languages (primary subtags; `und` for unknown). */
  languages: string[];
  /** Any of these story formats. */
  formats: string[];
  minRating?: number;
  minVotes?: number;
  /** Any of these play time buckets. */
  times: PlayTime[];
  /** Any of these forgiveness ratings (lower case). */
  forgiveness: string[];
  /** Release year range, inclusive. */
  from?: number;
  to?: number;
  /** Newcomer-friendly games only. */
  starter: boolean;
}

export const NO_FILTERS: Filters = {
  genres: [],
  languages: [],
  formats: [],
  times: [],
  forgiveness: [],
  starter: false,
};

/** Hash keys of the filters (a Library URL also has q, page, sort and panel). */
export const FILTER_KEYS = [
  'genre',
  'lang',
  'format',
  'rating',
  'votes',
  'time',
  'fg',
  'from',
  'to',
  'start',
];

/** List values are joined with commas (IFDB genres, languages and formats have none). */
function list(value: string | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  const parts = value.split(',');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].replace(/^\s+|\s+$/g, '');
    if (part && out.indexOf(part) < 0) out.push(part);
  }
  return out;
}

function number(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return isFinite(n) && n >= min && n <= max ? n : undefined;
}

function year(value: string | undefined): number | undefined {
  const n = number(value, 1000, 9999);
  return n === undefined ? undefined : Math.floor(n);
}

function known<T extends string>(values: string[], allowed: T[]): T[] {
  return values.filter((value) => allowed.indexOf(value as T) >= 0) as T[];
}

/** Filters from the Library's hash query; unknown or malformed values are ignored. */
export function parseFilters(query: Record<string, string>): Filters {
  return {
    genres: list(query.genre),
    languages: list(query.lang),
    formats: list(query.format),
    minRating: number(query.rating, 0, 5),
    minVotes: number(query.votes, 1, 1e6),
    times: known(list(query.time), PLAY_TIMES),
    forgiveness: known(list(query.fg && query.fg.toLowerCase()), FORGIVENESS),
    from: year(query.from),
    to: year(query.to),
    starter: query.start === '1',
  };
}

/** Hash query of `filters`: only what is set, so the default state has a clean URL. */
export function formatFilters(filters: Filters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.genres.length) query.genre = filters.genres.join(',');
  if (filters.languages.length) query.lang = filters.languages.join(',');
  if (filters.formats.length) query.format = filters.formats.join(',');
  if (filters.minRating !== undefined) query.rating = String(filters.minRating);
  if (filters.minVotes !== undefined) query.votes = String(filters.minVotes);
  if (filters.times.length) query.time = filters.times.join(',');
  if (filters.forgiveness.length) query.fg = filters.forgiveness.join(',');
  if (filters.from !== undefined) query.from = String(filters.from);
  if (filters.to !== undefined) query.to = String(filters.to);
  if (filters.starter) query.start = '1';
  return query;
}

export function parseSort(value: string | undefined): SortKey {
  return SORTS.indexOf(value as SortKey) >= 0 ? (value as SortKey) : DEFAULT_SORT;
}

/** How many filters are set (the "Filters (n)" button); a year range counts once. */
export function activeCount(filters: Filters): number {
  let n = 0;
  if (filters.genres.length) n++;
  if (filters.languages.length) n++;
  if (filters.formats.length) n++;
  if (filters.minRating !== undefined) n++;
  if (filters.minVotes !== undefined) n++;
  if (filters.times.length) n++;
  if (filters.forgiveness.length) n++;
  if (filters.from !== undefined || filters.to !== undefined) n++;
  if (filters.starter) n++;
  return n;
}

export function playTime(minutes: number): PlayTime {
  if (minutes < 30) return 'short';
  if (minutes < 60) return 'medium';
  if (minutes < 120) return 'long';
  return 'epic';
}

function lower(values: string[]): string[] {
  return values.map((value) => value.toLowerCase());
}

/**
 * The predicate of `filters`: every set filter must match (AND), a game matches a list filter when it has any of the
 * values (OR). A game whose value is unknown (no rating, no play time…) is left out by a filter on that value.
 */
export function matcher(filters: Filters): (row: IndexRow) => boolean {
  const genres = lower(filters.genres);
  return (row) => {
    if (genres.length) {
      const own = row.g ? lower(row.g) : [];
      let any = false;
      for (let i = 0; i < own.length && !any; i++) any = genres.indexOf(own[i]) >= 0;
      if (!any) return false;
    }
    if (filters.languages.length && filters.languages.indexOf(row.l || 'und') < 0) return false;
    if (filters.formats.length && filters.formats.indexOf(row.f) < 0) return false;
    if (filters.minRating !== undefined && !(row.r !== undefined && row.r >= filters.minRating)) {
      return false;
    }
    if (filters.minVotes !== undefined && !((row.rc || 0) >= filters.minVotes)) return false;
    if (filters.times.length && !(row.p && filters.times.indexOf(playTime(row.p)) >= 0)) {
      return false;
    }
    if (
      filters.forgiveness.length &&
      !(row.fg && filters.forgiveness.indexOf(row.fg.toLowerCase()) >= 0)
    ) {
      return false;
    }
    if (filters.from !== undefined && !(row.y && row.y >= filters.from)) return false;
    if (filters.to !== undefined && !(row.y && row.y <= filters.to)) return false;
    if (filters.starter && !row.st) return false;
    return true;
  };
}

/** Indices (into `rows`) of `indices` that pass `filters`, in the same order. */
export function applyFilters(rows: IndexRow[], indices: number[], filters: Filters): number[] {
  const test = matcher(filters);
  const out: number[] = [];
  for (let i = 0; i < indices.length; i++) if (test(rows[indices[i]])) out.push(indices[i]);
  return out;
}

/** Descending, unknown values last. */
function desc(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return b - a;
}

/**
 * Comparator of two rows for `sort`. Best rated is IFDB's star sort (the rating weighted by its count), most rated
 * the number of ratings, newest the year; ties are broken by the caller. Title is the index order.
 */
export function compareRows(sort: SortKey, a: IndexRow, b: IndexRow): number {
  switch (sort) {
    case 'rating':
      return desc(a.s, b.s) || desc(a.rc, b.rc);
    case 'votes':
      return desc(a.rc, b.rc) || desc(a.s, b.s);
    case 'new':
      return desc(a.y, b.y);
    default:
      return 0;
  }
}

/**
 * `indices` sorted by `sort`. The title order is the index order (rows are sorted by title); other sorts keep the
 * incoming order (search relevance, then title) among equals. The tie-break is explicit because older browsers'
 * Array#sort is not stable.
 */
export function sortIndices(rows: IndexRow[], indices: number[], sort: SortKey): number[] {
  if (sort === 'title') return indices.slice().sort((a, b) => a - b);
  const position: Record<number, number> = {};
  for (let i = 0; i < indices.length; i++) position[indices[i]] = i;
  return indices
    .slice()
    .sort((a, b) => compareRows(sort, rows[a], rows[b]) || position[a] - position[b]);
}

export interface FacetOption {
  /** Value stored in the hash. */
  value: string;
  count: number;
}

/**
 * Genres of `meta.json` with their counts, spellings that differ only by case merged ("Science Fiction" and
 * "Science fiction"; the most frequent spelling is kept), most frequent first.
 */
export function genreOptions(meta: Meta): FacetOption[] {
  const out: FacetOption[] = [];
  const at: Record<string, number> = {};
  const genres = meta.facets.genres;
  for (let i = 0; i < genres.length; i++) {
    const key = genres[i][0].toLowerCase();
    if (at[key] === undefined) {
      at[key] = out.length;
      out.push({ value: genres[i][0], count: genres[i][1] });
    } else out[at[key]].count += genres[i][1];
  }
  return out.sort((a, b) => b.count - a.count);
}

export function facetOptions(values: Array<[string, number]>): FacetOption[] {
  return values.map((entry) => ({ value: entry[0], count: entry[1] }));
}

/** Games of the whole catalogue having each of `values` (counts of the fixed choices: ratings, play time…). */
export function countBy<T>(
  rows: IndexRow[],
  values: T[],
  has: (row: IndexRow, value: T) => boolean,
) {
  const counts: number[] = [];
  for (let v = 0; v < values.length; v++) {
    let n = 0;
    for (let i = 0; i < rows.length; i++) if (has(rows[i], values[v])) n++;
    counts.push(n);
  }
  return counts;
}

/** Language names in their own language ("Français"), as readers look for them; unknown codes show as is. */
const LANGUAGE_NAMES: Record<string, string> = {
  ca: 'Català',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  eo: 'Esperanto',
  es: 'Español',
  eu: 'Euskara',
  fi: 'Suomi',
  fr: 'Français',
  gl: 'Galego',
  hu: 'Magyar',
  it: 'Italiano',
  ja: '日本語',
  jbo: 'Lojban',
  la: 'Latina',
  nb: 'Norsk bokmål',
  nl: 'Nederlands',
  no: 'Norsk',
  pl: 'Polski',
  pt: 'Português',
  ro: 'Română',
  ru: 'Русский',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  zh: '中文',
};

/** Name of a language subtag, or undefined for `und` (the caller shows "Unknown"). */
export function languageName(code: string): string | undefined {
  if (code === 'und') return undefined;
  return LANGUAGE_NAMES[code] || code;
}

export const FORMAT_NAMES: Record<string, string> = {
  zcode: 'Z-code',
  glulx: 'Glulx',
  twine: 'Twine',
  ink: 'ink',
};

export function formatName(format: string): string {
  return FORMAT_NAMES[format] || format;
}
