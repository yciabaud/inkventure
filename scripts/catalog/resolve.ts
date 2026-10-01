// Playability resolution CLI (SPEC §5.2 steps 2–3; story S2.2): reads the crawler's raw dataset, writes the playable
// games and a report of the games left out, with their reasons.
//
//   node scripts/catalog/resolve.ts [--in FILE] [--out DIR] [--cors FILE] [--pictures FILE] [--summary FILE]
//
// CONTENT_POLICY=general (default) | adult. Formats: scripts/catalog/playability.json. Policy lists:
// scripts/catalog/content-policy.json. --summary appends a Markdown summary (e.g. $GITHUB_STEP_SUMMARY).
// --cors: the checks of `check-cors.ts`; a file outside the IF Archive is then used only if the app can read it.
// Without it every host is assumed readable (local runs on fixtures).
// --pictures: the checks of `check-pictures.ts`; games whose Blorb holds pictures besides the cover are illustrated.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { RawDataset } from './crawler.ts';
import {
  resolve,
  type ContentPolicy,
  type ContentPolicyConfig,
  type StoryFormat,
} from './resolver.ts';
import { readableFrom, type CorsCache } from './cors.ts';
import { picturesFrom, type PicturesCache } from './pictures.ts';
import { summarize } from './summary.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/raw/games.json' },
    out: { type: 'string', default: 'data/resolved' },
    cors: { type: 'string' },
    pictures: { type: 'string' },
    summary: { type: 'string' },
  },
});

const policy = (process.env.CONTENT_POLICY || 'general') as ContentPolicy;
if (policy !== 'general' && policy !== 'adult') {
  console.error('CONTENT_POLICY must be "general" or "adult".');
  process.exit(2);
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const dataset = readJson<RawDataset>(values.in);
const config = readJson<ContentPolicyConfig>('scripts/catalog/content-policy.json');
const { enabledFormats } = readJson<{ enabledFormats: StoryFormat[] }>(
  'scripts/catalog/playability.json',
);

const resolution = resolve(dataset, {
  enabledFormats: enabledFormats,
  policy: policy,
  config: config,
  readable: values.cors ? readableFrom(readJson<CorsCache>(values.cors)) : undefined,
  pictures: values.pictures ? picturesFrom(readJson<PicturesCache>(values.pictures)) : undefined,
});

mkdirSync(values.out, { recursive: true });
writeFileSync(
  join(values.out, 'games.json'),
  JSON.stringify({ games: resolution.games }, null, 2) + '\n',
);
const report = {
  policy: resolution.policy,
  enabledFormats: resolution.enabledFormats,
  counts: resolution.counts,
  dropped: resolution.dropped,
};
writeFileSync(join(values.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const summary = summarize(dataset, resolution);
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');
