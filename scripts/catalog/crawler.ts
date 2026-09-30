// Crawler core (SPEC §5.2, step 1): pages through IFDB searches, then fetches each candidate's `viewgame?json`
// record, reusing cached records whose IFDB page version has not changed. Pure over a Fetcher and a RecordCache,
// so it runs the same live, recording or offline (tests).
import {
  IfdbError,
  pageVersionOf,
  parseSearch,
  parseViewgame,
  searchUrl,
  viewgameUrl,
  type GameRecord,
  type SearchRow,
} from './ifdb.ts';
import type { Fetcher } from './fetcher.ts';

/** Safety stop for a search that never returns an empty page (100 rows per page: 20,000 games). */
export const MAX_SEARCH_PAGES = 200;

/** Records of games without cover art carry no page version in search rows: re-fetch them after this many days. */
export const UNVERSIONED_MAX_AGE_DAYS = 30;

const DAY_MS = 86400000;

export interface Candidate {
  row: SearchRow;
  /** The searches that returned the game (a game can match several). */
  queries: string[];
}

async function getBody(fetcher: Fetcher, url: string): Promise<string> {
  const response = await fetcher(url);
  if (response.status === 200) return response.body;
  const message = 'HTTP ' + response.status + ' for ' + url;
  // Still failing after the retries: IFDB is down or throttling us, stop rather than drop games. A 4xx is the
  // listing's own problem (e.g. deleted since the search).
  if (response.status === 429 || response.status >= 500) throw new Error(message);
  throw new IfdbError(message);
}

/**
 * Every game row of a search. IFDB leaves hidden games out of a page without shortening the paging, so a short page
 * is not the last one: the search ends at the first empty page.
 */
export async function searchAll(
  fetcher: Fetcher,
  query: string,
  maxPages = MAX_SEARCH_PAGES,
): Promise<SearchRow[]> {
  const rows: SearchRow[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const games = parseSearch(await getBody(fetcher, searchUrl(query, page)));
    if (!games.length) return rows;
    rows.push(...games);
  }
  throw new IfdbError('search "' + query + '" still has results after ' + maxPages + ' pages');
}

/** The union of the searches, one candidate per TUID, sorted by TUID. */
export async function collectCandidates(
  fetcher: Fetcher,
  queries: string[],
  maxPages = MAX_SEARCH_PAGES,
): Promise<Candidate[]> {
  const byTuid = new Map<string, Candidate>();
  for (const query of queries) {
    for (const row of await searchAll(fetcher, query, maxPages)) {
      const known = byTuid.get(row.tuid);
      if (!known) byTuid.set(row.tuid, { row: row, queries: [query] });
      else if (known.queries.indexOf(query) < 0) known.queries.push(query);
    }
  }
  return Array.from(byTuid.values()).sort((a, b) => compare(a.row.tuid, b.row.tuid));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface CacheEntry {
  tuid: string;
  pageVersion: number;
  /** ISO date of the fetch. */
  fetchedAt: string;
  record: GameRecord;
}

export interface RecordCache {
  get(tuid: string): CacheEntry | undefined;
  set(entry: CacheEntry): void;
}

/** Whether a cached record can be reused: same page version, or (no version known) fetched recently enough. */
export function isFresh(
  entry: CacheEntry | undefined,
  version: number | undefined,
  now: Date,
  maxAgeDays = UNVERSIONED_MAX_AGE_DAYS,
): boolean {
  if (!entry) return false;
  if (version !== undefined) return entry.pageVersion === version;
  const age = now.getTime() - new Date(entry.fetchedAt).getTime();
  return age >= 0 && age < maxAgeDays * DAY_MS;
}

/** One game of the raw dataset: its search row and full IFDB record. */
export interface RawGame {
  tuid: string;
  pageVersion: number;
  queries: string[];
  search: SearchRow;
  record: GameRecord;
}

export interface FetchResult {
  games: RawGame[];
  fetched: number;
  reused: number;
  /** Games whose record could not be fetched (left out of the dataset). */
  failed: Array<{ tuid: string; error: string }>;
}

/** Fetches the record of each candidate, or reuses the cached one (incremental mode). */
export async function fetchRecords(
  fetcher: Fetcher,
  candidates: Candidate[],
  cache: RecordCache,
  now: Date,
  maxAgeDays = UNVERSIONED_MAX_AGE_DAYS,
): Promise<FetchResult> {
  const result: FetchResult = { games: [], fetched: 0, reused: 0, failed: [] };
  for (const candidate of candidates) {
    const tuid = candidate.row.tuid;
    let entry = cache.get(tuid);
    if (isFresh(entry, pageVersionOf(candidate.row), now, maxAgeDays)) {
      result.reused++;
    } else {
      try {
        const record = parseViewgame(await getBody(fetcher, viewgameUrl(tuid)), tuid);
        entry = {
          tuid: tuid,
          pageVersion: record.ifdb.pageversion,
          fetchedAt: now.toISOString(),
          record: record,
        };
        cache.set(entry);
        result.fetched++;
      } catch (error) {
        // A network failure stops the crawl (retries are exhausted); a bad listing only skips the game.
        if (!(error instanceof IfdbError)) throw error;
        result.failed.push({ tuid: tuid, error: error.message });
        continue;
      }
    }
    result.games.push({
      tuid: tuid,
      pageVersion: entry!.pageVersion,
      queries: candidate.queries,
      search: candidate.row,
      record: entry!.record,
    });
  }
  return result;
}

/** The raw dataset written to `data/raw/games.json`: deterministic (no dates), games sorted by TUID. */
export interface RawDataset {
  source: string;
  queries: string[];
  games: RawGame[];
}

export async function crawl(
  fetcher: Fetcher,
  queries: string[],
  cache: RecordCache,
  now: Date,
  options: { limit?: number; maxPages?: number } = {},
): Promise<{ dataset: RawDataset; result: FetchResult; candidates: number }> {
  let candidates = await collectCandidates(fetcher, queries, options.maxPages);
  const total = candidates.length;
  if (options.limit !== undefined) candidates = candidates.slice(0, options.limit);
  const result = await fetchRecords(fetcher, candidates, cache, now);
  return {
    dataset: { source: 'https://ifdb.org/', queries: queries, games: result.games },
    result: result,
    candidates: total,
  };
}
