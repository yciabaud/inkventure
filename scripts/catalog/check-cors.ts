// CORS check CLI (SPEC §5.5): for the games without an IF Archive file, checks whether the app can read their story
// files from the browser, and keeps the results in a cache the resolver reads (`resolve.ts --cors`). Live network,
// at most 1 request per second; each file is checked again after CORS_MAX_AGE_DAYS.
//
//   node scripts/catalog/check-cors.ts [--in FILE] [--cache FILE] [--summary FILE]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { checkReadable, isFresh, type CorsCache, type Probe } from './cors.ts';
import type { RawDataset } from './crawler.ts';
import { RateLimiter, USER_AGENT } from './fetcher.ts';
import { urlsToCheck, type StoryFormat } from './resolver.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    cache: { type: 'string', default: 'data/cache/cors.json' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const { enabledFormats } = readJson<{ enabledFormats: StoryFormat[] }>(
  'scripts/catalog/playability.json',
);
const cache: CorsCache = existsSync(values.cache) ? readJson<CorsCache>(values.cache) : {};
const now = new Date();

const urls: string[] = [];
for (const game of dataset.games) {
  for (const url of urlsToCheck(game.record, game.search.devsys || '', enabledFormats)) {
    if (urls.indexOf(url) < 0) urls.push(url);
  }
}

const limiter = new RateLimiter(1000);
const probe: Probe = async (url, headers) => {
  await limiter.wait();
  const response = await fetch(url, {
    headers: { ...headers, 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (response.body) await response.body.cancel();
  return { status: response.status, header: (name) => response.headers.get(name) };
};

let checked = 0;
for (const url of urls) {
  if (isFresh(cache[url], now)) continue;
  let result: { ok: boolean; detail?: string; transient?: boolean };
  try {
    result = await checkReadable(url, probe);
  } catch (error) {
    result = { ok: false, detail: 'network: ' + (error as Error).message, transient: true };
  }
  cache[url] = { ok: result.ok, checked: now.toISOString() };
  if (result.detail) cache[url].detail = result.detail;
  if (result.transient) cache[url].transient = true;
  checked++;
}

// Only the files still in the dataset, sorted: the same results always give the same file.
const kept: CorsCache = {};
for (const url of urls.slice().sort()) kept[url] = cache[url];
mkdirSync(dirname(values.cache), { recursive: true });
writeFileSync(values.cache, JSON.stringify(kept, null, 2) + '\n');

const readable = urls.filter((url) => kept[url].ok).length;
const summary = [
  '### Story files outside the IF Archive',
  '',
  `${urls.length} file(s) to check, ${checked} checked now (the others from the cache): ` +
    `${readable} readable by the app, ${urls.length - readable} not (their games are left out).`,
].join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
