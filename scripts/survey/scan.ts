// Story-file scan CLI (story S7.4): reads the story file of every parser game of the published catalogue, without
// playing it, and writes a report of the display features they use. Run by hand, never in CI: it downloads the story
// files (at most 1 request per second, cached in data/cache/survey/, shared with the rendering survey).
//
//   npm run survey:scan -- [--top N] [--catalog DIR] [--only TUID,…] [--out FILE] [--json FILE]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogDir, gameFile, parserGames, storyBytes } from './catalog.ts';
import { features, libraryOf, ownGlyphs, storyFacts, type StoryFacts } from './features.ts';
import { scanReport, type ScanResult } from './scan-report.ts';

const { values } = parseArgs({
  options: {
    top: { type: 'string' },
    catalog: { type: 'string' },
    only: { type: 'string' },
    out: { type: 'string' },
    json: { type: 'string', default: 'data/survey/scan.json' },
    cache: { type: 'string', default: 'data/cache/survey' },
  },
});

async function main() {
  const dir = catalogDir(values.catalog);
  const games = parserGames(dir, values.only, values.top ? Number(values.top) : undefined);
  console.log('Reading ' + games.length + ' story files from ' + dir);
  const read: Array<{ result: ScanResult; facts: StoryFacts | null }> = [];
  let done = 0;
  for (const game of games) {
    const result: ScanResult = {
      tuid: game.t,
      title: game.n,
      format: game.f,
      ratings: game.rc || 0,
      featured: game.featured,
      counts: {},
      glyphs: [],
    };
    let facts: StoryFacts | null = null;
    try {
      facts = storyFacts(await storyBytes(gameFile(dir, game.t), values.cache!));
    } catch (error) {
      result.error = String(error).slice(0, 120);
    }
    read.push({ result: result, facts: facts });
    if (++done % 50 === 0) console.log(done + ' / ' + games.length);
  }
  // The libraries' code, by frequency over every game read.
  const library = libraryOf(read.map((r) => r.facts).filter((f): f is StoryFacts => !!f));
  for (const { result, facts } of read) {
    if (!facts) continue;
    result.counts = features(facts, library);
    result.glyphs = ownGlyphs(facts, library);
  }
  const results = read.map((r) => r.result);
  const date = new Date().toISOString().slice(0, 10);
  const out = values.out || 'docs/reports/story-file-scan-' + date + '.md';
  writeFileSync(out, scanReport(results, date));
  mkdirSync(dirname(values.json!), { recursive: true });
  writeFileSync(values.json!, JSON.stringify(results, null, 1));
  console.log('Report: ' + out + ' (' + results.filter((r) => r.error).length + ' not read)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
