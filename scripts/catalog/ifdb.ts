// IFDB API: request URLs and response parsing (SPEC §5.2, step 1).
// Shapes follow IFDB's source (iftechfoundation/ifdb: www/search, www/viewgame-components/viewgame-api.php) and its
// API pages (https://ifdb.org/api/search, https://ifdb.org/api/viewgame).

export const IFDB_ROOT = 'https://ifdb.org/';

/** Rows per page of `search?json` (fixed by IFDB). Hidden (flagged) games are left out, so a page may hold fewer. */
export const SEARCH_PAGE_SIZE = 100;

/** A game row of `search?json`. Rating fields are absent for hidden games; `coverArtLink` only when it has art. */
export interface SearchRow {
  tuid: string;
  title: string;
  link: string;
  author: string;
  hasCoverArt: boolean;
  devsys: string;
  published?: { machine: string | null; printable: string | null };
  averageRating?: number | null;
  numRatings?: number;
  starRating?: number;
  starSort?: number | null;
  coverArtLink?: string;
  playTimeInMinutes?: number;
}

/**
 * `viewgame?json` record. Only the fields the pipeline relies on are typed; the rest is kept as returned (the raw
 * dataset stores the whole record for the playability resolver, S2.2).
 */
export interface GameRecord {
  identification?: { ifids?: string[]; format?: string };
  bibliographic?: Record<string, unknown>;
  ifdb: {
    tuid: string;
    pageversion: number;
    downloads?: { links?: Array<{ url: string; format?: string; isGame?: boolean }> };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Game search, sorted by title so pages are stable between requests. `pg` starts at 1. */
export function searchUrl(query: string, page: number): string {
  return (
    IFDB_ROOT + 'search?json&searchfor=' + encodeURIComponent(query) + '&sortby=ttl&pg=' + page
  );
}

export function viewgameUrl(tuid: string): string {
  return IFDB_ROOT + 'viewgame?json&id=' + encodeURIComponent(tuid);
}

/** IFDB answers errors (bad query, unknown game) with HTTP 200 and `{"error": "…"}`. */
export class IfdbError extends Error {}

function parseJson(body: string, what: string): unknown {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new IfdbError(what + ': response is not JSON');
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new IfdbError(what + ': ' + String((data as { error: unknown }).error));
  }
  return data;
}

/** The game rows of one search page (an empty array past the last page). */
export function parseSearch(body: string): SearchRow[] {
  const data = parseJson(body, 'search') as { games?: unknown };
  if (!data || !Array.isArray(data.games)) throw new IfdbError('search: no "games" array');
  return data.games.filter(
    (row): row is SearchRow => !!row && typeof (row as SearchRow).tuid === 'string',
  );
}

export function parseViewgame(body: string, tuid: string): GameRecord {
  const data = parseJson(body, 'viewgame ' + tuid) as GameRecord;
  if (!data || !data.ifdb || data.ifdb.tuid !== tuid) {
    throw new IfdbError('viewgame ' + tuid + ': unexpected record');
  }
  return data;
}

/**
 * The listing's page version as seen in a search row: IFDB versions the cover art link with it
 * (`coverart?id=…&version=<pagevsn>`). Undefined for games without cover art.
 */
export function pageVersionOf(row: SearchRow): number | undefined {
  const match = row.coverArtLink && /[?&]version=(\d+)/.exec(row.coverArtLink);
  return match ? Number(match[1]) : undefined;
}
