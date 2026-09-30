// Catalogue crawler CLI (SPEC §5.2, step 1; story S2.1). Writes the raw dataset for the playability resolver (S2.2).
//
//   node scripts/catalog/crawl.ts [--offline | --record] [--fixtures DIR] [--out DIR] [--cache DIR]
//                                 [--queries FILE] [--limit N] [--max-pages N]
//
// Live (default): queries ifdb.org politely (≤ 1 request/s, retries with backoff) — never in PR CI.
// --record: live, and saves every response in the fixtures directory. --offline: replays the fixtures, no network.
// Live, records are cached per game (`--cache`) and fetched again only when the IFDB page version changed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { crawl, type CacheEntry, type RecordCache } from './crawler.ts';
import {
  liveFetcher,
  offlineFetcher,
  recordingFetcher,
  withRetries,
  type Fetcher,
} from './fetcher.ts';

const { values } = parseArgs({
  options: {
    offline: { type: 'boolean', default: false },
    record: { type: 'boolean', default: false },
    fixtures: { type: 'string', default: 'tests/fixtures/ifdb' },
    out: { type: 'string', default: 'data/raw' },
    cache: { type: 'string', default: 'data/cache/viewgame' },
    queries: { type: 'string', default: 'scripts/catalog/queries.json' },
    limit: { type: 'string' },
    'max-pages': { type: 'string' },
  },
});

if (values.offline && values.record) {
  console.error('--offline and --record cannot be combined.');
  process.exit(2);
}

/** One JSON file per game in `dir`. */
function fileCache(dir: string): RecordCache {
  mkdirSync(dir, { recursive: true });
  return {
    get(tuid) {
      const path = join(dir, tuid + '.json');
      return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as CacheEntry) : undefined;
    },
    set(entry) {
      writeFileSync(join(dir, entry.tuid + '.json'), JSON.stringify(entry) + '\n');
    },
  };
}

function memoryCache(): RecordCache {
  const entries = new Map<string, CacheEntry>();
  return { get: (tuid) => entries.get(tuid), set: (entry) => entries.set(entry.tuid, entry) };
}

let fetcher: Fetcher;
if (values.offline) {
  fetcher = offlineFetcher(values.fixtures);
} else {
  fetcher = withRetries(liveFetcher(), { retries: 4, baseDelay: 2000 });
  if (values.record) fetcher = recordingFetcher(fetcher, values.fixtures);
}

const queries = (JSON.parse(readFileSync(values.queries, 'utf8')) as { queries: string[] }).queries;
// Offline, every record comes from the fixtures (an in-memory cache), so the output depends on them alone.
const cache = values.offline ? memoryCache() : fileCache(values.cache);
const { dataset, result, candidates } = await crawl(fetcher, queries, cache, new Date(), {
  limit: values.limit ? Number(values.limit) : undefined,
  maxPages: values['max-pages'] ? Number(values['max-pages']) : undefined,
});

mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, 'games.json'), JSON.stringify(dataset, null, 2) + '\n');
console.log(
  `${candidates} candidates, ${dataset.games.length} games written to ${values.out}/games.json ` +
    `(${result.fetched} fetched, ${result.reused} from cache, ${result.failed.length} failed)`,
);
for (const failure of result.failed) console.warn(`  skipped ${failure.tuid}: ${failure.error}`);
