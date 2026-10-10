// Decker web exports CLI (SPEC §5.2 step 2; story S2.9): opens the web exports of the Decker games and records which
// page holds each deck, with what a look at the deck shows, in a cache the resolver reads (`resolve.ts --decker`).
// Live network, at most 1 request per second; a check is reused for DECKER_MAX_AGE_DAYS.
//
//   node scripts/catalog/check-decker.ts [--in FILE] [--cache FILE] [--summary FILE]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import type { RawDataset } from './crawler.ts';
import {
  deckerExportsToInspect,
  deckerKey,
  deckerSummary,
  inspectDeckerExport,
  isFresh,
  type DeckerCache,
} from './decker.ts';
import { RateLimiter, USER_AGENT } from './fetcher.ts';
import type { FetchBytes } from './ink.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    cache: { type: 'string', default: 'data/cache/decker.json' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const links = deckerExportsToInspect(dataset);
const cache: DeckerCache = existsSync(values.cache) ? readJson<DeckerCache>(values.cache) : {};
const now = new Date();

const limiter = new RateLimiter(1000);
const fetchBytes: FetchBytes = async (url) => {
  await limiter.wait();
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
};

let inspected = 0;
for (const link of links) {
  const key = deckerKey(link);
  if (isFresh(cache[key], now)) continue;
  try {
    cache[key] = await inspectDeckerExport(link, fetchBytes, now);
  } catch (error) {
    cache[key] = {
      checked: now.toISOString(),
      detail: 'network: ' + (error as Error).message,
      transient: true,
    };
  }
  inspected++;
}

// Only the exports still in the dataset, sorted: the same results always give the same file.
const kept: DeckerCache = {};
for (const link of links) kept[deckerKey(link)] = cache[deckerKey(link)];
mkdirSync(dirname(values.cache), { recursive: true });
writeFileSync(values.cache, JSON.stringify(kept, null, 2) + '\n');

const found = links.filter((link) => kept[deckerKey(link)].page).length;
const summary = [
  '### Decker web exports',
  '',
  `${links.length} export(s) of Decker games, ${inspected} opened now (the others from the cache): ` +
    `${found} with a deck, ${links.length - found} without (or not read).`,
  '',
  deckerSummary(links, kept),
].join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
