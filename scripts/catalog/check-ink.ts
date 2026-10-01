// Ink web exports CLI (SPEC §5.2 step 2; story S2.7): opens the web exports of the ink games (zips and pages) and
// records which file holds each story, in a cache the resolver reads (`resolve.ts --ink`). Live network, at most 1
// request per second; a check is reused for INK_MAX_AGE_DAYS.
//
//   node scripts/catalog/check-ink.ts [--in FILE] [--cache FILE] [--summary FILE]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import type { RawDataset } from './crawler.ts';
import { RateLimiter, USER_AGENT } from './fetcher.ts';
import {
  exportsToInspect,
  inkKey,
  inspectExport,
  isFresh,
  type FetchBytes,
  type InkCache,
} from './ink.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    cache: { type: 'string', default: 'data/cache/ink.json' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const links = exportsToInspect(dataset);
const cache: InkCache = existsSync(values.cache) ? readJson<InkCache>(values.cache) : {};
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
  const key = inkKey(link);
  if (isFresh(cache[key], now)) continue;
  try {
    cache[key] = await inspectExport(link, fetchBytes, now);
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
const kept: InkCache = {};
for (const link of links) kept[inkKey(link)] = cache[inkKey(link)];
mkdirSync(dirname(values.cache), { recursive: true });
writeFileSync(values.cache, JSON.stringify(kept, null, 2) + '\n');

const found = links.filter((link) => kept[inkKey(link)].story).length;
const summary = [
  '### Ink web exports',
  '',
  `${links.length} export(s) of ink games, ${inspected} opened now (the others from the cache): ` +
    `${found} with a compiled story, ${links.length - found} without (or not read).`,
].join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
