// Illustrated games CLI (SPEC §5.2 step 2; story S2.5): for the playable games whose story file is a Blorb in a format
// whose engine draws pictures, reads the Blorb's resource index from the head of the file and counts the pictures
// besides the cover. The results go to a cache the resolver reads (`resolve.ts --pictures`). Live network, at most 1
// request per second; a check is reused for PICTURES_MAX_AGE_DAYS, then revalidated.
//
//   node scripts/catalog/check-pictures.ts [--in FILE] [--cors FILE] [--cache FILE] [--summary FILE]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { readableFrom, type CorsCache } from './cors.ts';
import type { RawDataset } from './crawler.ts';
import { RateLimiter, USER_AGENT } from './fetcher.ts';
import {
  inspect,
  isFresh,
  MIN_PICTURES,
  readHead,
  urlsToInspect,
  type FetchHead,
  type PicturesCache,
} from './pictures.ts';
import {
  resolve,
  type ContentPolicy,
  type ContentPolicyConfig,
  type StoryFormat,
} from './resolver.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    cors: { type: 'string' },
    cache: { type: 'string', default: 'data/cache/pictures.json' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const { enabledFormats } = readJson<{ enabledFormats: StoryFormat[] }>(
  'scripts/catalog/playability.json',
);
// The files the resolver will pick (offline): the same options as resolve.ts.
const games = resolve(dataset, {
  enabledFormats: enabledFormats,
  policy: (process.env.CONTENT_POLICY || 'general') as ContentPolicy,
  config: readJson<ContentPolicyConfig>('scripts/catalog/content-policy.json'),
  readable: values.cors ? readableFrom(readJson<CorsCache>(values.cors)) : undefined,
}).games;
const urls = urlsToInspect(games);
const cache: PicturesCache = existsSync(values.cache) ? readJson<PicturesCache>(values.cache) : {};
const now = new Date();

const limiter = new RateLimiter(1000);
const fetchHead: FetchHead = async (url, length, headers) => {
  await limiter.wait();
  const response = await fetch(url, {
    headers: { ...headers, Range: 'bytes=0-' + (length - 1), 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60000),
  });
  return readHead(response, length);
};

let inspected = 0;
for (const url of urls) {
  if (isFresh(cache[url], now)) continue;
  try {
    cache[url] = await inspect(url, fetchHead, now, cache[url]);
  } catch (error) {
    cache[url] = {
      checked: now.toISOString(),
      detail: 'network: ' + (error as Error).message,
      transient: true,
    };
  }
  inspected++;
}

// Only the files still in the catalogue, sorted: the same results always give the same file.
const kept: PicturesCache = {};
for (const url of urls) kept[url] = cache[url];
mkdirSync(dirname(values.cache), { recursive: true });
writeFileSync(values.cache, JSON.stringify(kept, null, 2) + '\n');

const known = urls.filter((url) => kept[url].pictures !== undefined).length;
const illustrated = urls.filter((url) => (kept[url].pictures || 0) >= MIN_PICTURES).length;
const summary = [
  '### Illustrated games',
  '',
  `${urls.length} Blorb(s) that could hold pictures, ${inspected} inspected now (the others from the cache): ` +
    `${known} with a readable index, ${illustrated} with at least ${MIN_PICTURES} pictures besides the cover.`,
].join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
