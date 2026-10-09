// Story files CLI (SPEC §5.2 step 2; story S2.8): opens every Z-machine and Glulx file the resolver may pick, as the
// app would, and records whether it opens, in a cache the resolver reads (`resolve.ts --stories`). Live network, at
// most 1 request per second; a check is reused for STORIES_MAX_AGE_DAYS. The summary lists the files that do not
// open, with the reason (to report to IFDB when the record is wrong).
//
//   node scripts/catalog/check-stories.ts [--in FILE] [--ink FILE] [--cache FILE] [--summary FILE]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import type { RawDataset } from './crawler.ts';
import { RateLimiter, USER_AGENT } from './fetcher.ts';
import { inkStoryFrom, type InkCache } from './ink.ts';
import { readHead } from './pictures.ts';
import type { StoryFormat } from './resolver.ts';
import {
  inspectStory,
  isFresh,
  MAX_ZIP_BYTES,
  storiesToCheck,
  storyKey,
  type FetchRange,
  type StoriesCache,
} from './stories.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    ink: { type: 'string' },
    cache: { type: 'string', default: 'data/cache/stories.json' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const { enabledFormats } = readJson<{ enabledFormats: StoryFormat[] }>(
  'scripts/catalog/playability.json',
);
const files = storiesToCheck(
  dataset,
  enabledFormats,
  values.ink ? inkStoryFrom(readJson<InkCache>(values.ink)) : undefined,
);
const cache: StoriesCache = existsSync(values.cache) ? readJson<StoriesCache>(values.cache) : {};
const now = new Date();

const limiter = new RateLimiter(1000);
const fetchRange: FetchRange = async (url, start, length) => {
  await limiter.wait();
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (length !== undefined) headers.Range = 'bytes=' + start + '-' + (start + length - 1);
  const response = await fetch(url, { headers: headers, signal: AbortSignal.timeout(120000) });
  if (length === undefined) {
    // A whole zip, at most MAX_ZIP_BYTES (and one more byte, to tell a bigger one).
    const head = await readHead(response, MAX_ZIP_BYTES + 1);
    return { status: head.status, bytes: head.bytes };
  }
  if (response.status === 206) {
    const head = await readHead(response, length);
    return { status: 206, bytes: head.bytes };
  }
  // Range not honoured: the whole file, read only as far as needed.
  const head = await readHead(response, start + length);
  return { status: head.status, bytes: head.bytes.subarray(start) };
};

let inspected = 0;
for (const file of files) {
  const key = storyKey(file);
  if (isFresh(cache[key], now)) continue;
  try {
    cache[key] = await inspectStory(file, fetchRange, now);
  } catch (error) {
    cache[key] = {
      checked: now.toISOString(),
      detail: 'network: ' + (error as Error).message,
      transient: true,
    };
  }
  inspected++;
}

// Only the files still in the dataset, sorted: the same results always give the same file.
const kept: StoriesCache = {};
for (const file of files) kept[storyKey(file)] = cache[storyKey(file)];
mkdirSync(dirname(values.cache), { recursive: true });
writeFileSync(values.cache, JSON.stringify(kept, null, 2) + '\n');

const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
const failed = files.filter((file) => !kept[storyKey(file)].ok && !kept[storyKey(file)].transient);
const renamed = files.filter((file) => kept[storyKey(file)].primary);
const transient = files.filter((file) => kept[storyKey(file)].transient).length;
const games = (file: (typeof files)[number]) =>
  (file.games || []).map((g) => `${cell(g.title)} (\`${g.tuid}\`)`).join(', ');
const lines = [
  '### Story files',
  '',
  `${files.length} Z-machine and Glulx file(s), ${inspected} opened now (the others from the cache): ` +
    `${failed.length} do not open, ${renamed.length} hold their story under another name, ` +
    `${transient} not read (network, checked again next time).`,
  '',
];
if (failed.length) {
  lines.push(
    '**Files that do not open** (left out; to report to IFDB when the record is wrong)',
    '',
    '| Game(s) | File | Why |',
    '|---|---|---|',
  );
  for (const file of failed) {
    const entry = kept[storyKey(file)];
    lines.push(
      `| ${games(file)} | ${cell(storyKey(file))} | ${entry.problem}${entry.detail ? ': ' + cell(entry.detail) : ''} |`,
    );
  }
  lines.push('');
}
if (renamed.length) {
  lines.push(
    '**Stories found under another name in their zip**',
    '',
    '| Game(s) | IFDB names | In the zip |',
    '|---|---|---|',
  );
  for (const file of renamed) {
    lines.push(
      `| ${games(file)} | ${cell(file.primary || '')} | ${cell(kept[storyKey(file)].primary!)} |`,
    );
  }
  lines.push('');
}
const summary = lines.join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
