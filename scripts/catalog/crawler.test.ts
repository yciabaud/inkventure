import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectCandidates,
  crawl,
  fetchRecords,
  isFresh,
  searchAll,
  type CacheEntry,
  type Candidate,
  type RecordCache,
} from './crawler';
import { offlineFetcher, type Fetcher } from './fetcher';
import { searchUrl, viewgameUrl, type SearchRow } from './ifdb';

const FIXTURES = 'tests/fixtures/ifdb';
const QUERIES = (
  JSON.parse(readFileSync('scripts/catalog/queries.json', 'utf8')) as { queries: string[] }
).queries;
const NOW = new Date('2026-09-30T00:00:00Z');

/** Serves canned bodies by URL and counts requests. */
function fake(routes: Record<string, string | number>): Fetcher & { urls: string[] } {
  const fetcher = (async (url: string) => {
    fetcher.urls.push(url);
    const answer = routes[url];
    if (answer === undefined) throw new Error('unexpected request ' + url);
    return typeof answer === 'number'
      ? { status: answer, body: '' }
      : { status: 200, body: answer };
  }) as Fetcher & { urls: string[] };
  fetcher.urls = [];
  return fetcher;
}

function page(...tuids: string[]): string {
  return JSON.stringify({ games: tuids.map((tuid) => ({ tuid: tuid, title: tuid })) });
}

function record(tuid: string, pageversion: number): string {
  return JSON.stringify({ ifdb: { tuid: tuid, pageversion: pageversion } });
}

function memory(entries: CacheEntry[] = []): RecordCache & { entries: Map<string, CacheEntry> } {
  const map = new Map(entries.map((entry) => [entry.tuid, entry]));
  return { entries: map, get: (tuid) => map.get(tuid), set: (entry) => map.set(entry.tuid, entry) };
}

function candidate(tuid: string, version?: number): Candidate {
  const row = { tuid: tuid, title: tuid } as SearchRow;
  if (version !== undefined)
    row.coverArtLink = 'https://ifdb.org/coverart?id=' + tuid + '&version=' + version;
  return { row: row, queries: ['q'] };
}

describe('pagination', () => {
  it('goes on after a short page and stops at the first empty page', async () => {
    const fetcher = fake({
      [searchUrl('q', 1)]: page('a', 'b'),
      [searchUrl('q', 2)]: page('c'),
      [searchUrl('q', 3)]: page(),
    });
    expect((await searchAll(fetcher, 'q')).map((row) => row.tuid)).toEqual(['a', 'b', 'c']);
    expect(fetcher.urls).toHaveLength(3);
  });

  it('gives up on a search that never ends', async () => {
    const fetcher: Fetcher = async () => ({ status: 200, body: page('a') });
    await expect(searchAll(fetcher, 'q', undefined, 3)).rejects.toThrow(/after 3 pages/);
  });

  it('stops quietly at a page limit given on purpose', async () => {
    const fetcher: Fetcher = async () => ({ status: 200, body: page('a') });
    expect(await searchAll(fetcher, 'q', 2)).toHaveLength(2);
  });

  it('unions searches, one candidate per TUID sorted by TUID, remembering which searches found it', async () => {
    const fetcher = fake({
      [searchUrl('one', 1)]: page('m', 'b'),
      [searchUrl('one', 2)]: page(),
      [searchUrl('two', 1)]: page('b', 'a'),
      [searchUrl('two', 2)]: page(),
    });
    const candidates = await collectCandidates(fetcher, ['one', 'two']);
    expect(candidates.map((c) => [c.row.tuid, c.queries])).toEqual([
      ['a', ['two']],
      ['b', ['one', 'two']],
      ['m', ['one']],
    ]);
  });
});

describe('incremental cache', () => {
  const cached = (
    tuid: string,
    version: number,
    fetchedAt = '2026-09-20T00:00:00Z',
  ): CacheEntry => ({
    tuid: tuid,
    pageVersion: version,
    fetchedAt: fetchedAt,
    record: { ifdb: { tuid: tuid, pageversion: version } },
  });

  it('reuses a record whose page version is unchanged, fetches it again when it changed', async () => {
    const cache = memory([cached('a', 3), cached('b', 3)]);
    const fetcher = fake({
      [viewgameUrl('b')]: record('b', 4),
      [viewgameUrl('c')]: record('c', 1),
    });
    const result = await fetchRecords(
      fetcher,
      [candidate('a', 3), candidate('b', 4), candidate('c', 1)],
      cache,
      NOW,
    );
    expect(fetcher.urls).toEqual([viewgameUrl('b'), viewgameUrl('c')]);
    expect([result.fetched, result.reused]).toEqual([2, 1]);
    expect(result.games.map((g) => [g.tuid, g.pageVersion])).toEqual([
      ['a', 3],
      ['b', 4],
      ['c', 1],
    ]);
    expect(cache.entries.get('b')!.pageVersion).toBe(4);
    expect(cache.entries.get('c')!.fetchedAt).toBe(NOW.toISOString());
  });

  it('without a page version in the search row, reuses records younger than the maximum age', () => {
    expect(isFresh(cached('a', 3, '2026-09-20T00:00:00Z'), undefined, NOW, 30)).toBe(true);
    expect(isFresh(cached('a', 3, '2026-08-01T00:00:00Z'), undefined, NOW, 30)).toBe(false);
    expect(isFresh(undefined, undefined, NOW)).toBe(false);
    expect(isFresh(cached('a', 3), 3, NOW)).toBe(true);
    expect(isFresh(cached('a', 3), 4, NOW)).toBe(false);
  });

  it('skips a listing IFDB no longer serves, but stops when IFDB itself fails', async () => {
    const gone = fake({
      [viewgameUrl('a')]: '{"error":"No game was found"}',
      [viewgameUrl('b')]: 404,
      [viewgameUrl('c')]: record('c', 1),
    });
    const result = await fetchRecords(
      gone,
      [candidate('a'), candidate('b'), candidate('c')],
      memory(),
      NOW,
    );
    expect(result.games.map((g) => g.tuid)).toEqual(['c']);
    expect(result.failed.map((f) => f.tuid)).toEqual(['a', 'b']);

    const down = fake({ [viewgameUrl('a')]: 503 });
    await expect(fetchRecords(down, [candidate('a')], memory(), NOW)).rejects.toThrow(/HTTP 503/);
  });
});

describe('offline run on the recorded fixtures', () => {
  it('produces the same raw dataset every time, without any request outside the fixtures', async () => {
    const run = () => crawl(offlineFetcher(FIXTURES), QUERIES, memory(), NOW);
    const first = await run();
    const second = await run();
    expect(JSON.stringify(second.dataset)).toBe(JSON.stringify(first.dataset));

    expect(first.candidates).toBe(11);
    expect(first.dataset.games.map((g) => g.tuid)).toEqual([
      'fxadlt0000000008',
      'fxbell0000000002',
      'fxcave0000000003',
      'fxexcl0000000011',
      'fxhttp0000000010',
      'fxinky0000000007',
      'fxlamp0000000001',
      'fxnofl0000000009',
      'fxtwin0000000006',
      'fxzork0000000005',
    ]);
    expect(first.result.failed.map((f) => f.tuid)).toEqual(['fxgone0000000004']);
    const bells = first.dataset.games[1];
    expect(bells.queries).toEqual(['downloadable:yes system:inform']);
    expect(bells.record.ifdb.downloads!.links![0].format).toBe('blorb/glulx');
  });

  it('with a warm cache, fetches nothing whose page version is known and unchanged', async () => {
    const cache = memory();
    await crawl(offlineFetcher(FIXTURES), QUERIES, cache, NOW);
    const counting = fake({});
    const replay = offlineFetcher(FIXTURES);
    const fetcher: Fetcher = async (url) => {
      counting.urls.push(url);
      return replay(url);
    };
    const again = await crawl(fetcher, QUERIES, cache, NOW);
    // Only the searches, and the listing that failed the first time.
    expect(counting.urls.filter((url) => url.indexOf('viewgame') >= 0)).toEqual([
      viewgameUrl('fxgone0000000004'),
    ]);
    expect(again.result.reused).toBe(10);
  });
});
