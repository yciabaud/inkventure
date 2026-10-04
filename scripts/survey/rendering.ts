// Rendering survey CLI (story S7.3): plays the featured games and the most-rated parser games of the published
// catalogue headless, with the app's engines, and writes a report of what the reader may show wrong. Run by hand, never
// in CI: it downloads story files from the IF Archive (at most 1 request per second, cached in data/cache/survey/).
//
//   npm run survey:rendering -- [--top 50] [--catalog DIR] [--only TUID,…] [--out FILE] [--json FILE]
//
// The catalogue is the one the weekly workflow publishes on the `catalog` branch (fetched here), or `--catalog DIR`.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { applyPatch, PATCHES } from '../build/vendor-patches.ts';
import { catalogDir, gameFile, PARSER, parserGames, storyBytes } from './catalog.ts';
import type { Finding } from './detect.ts';
import type { PlayResult } from './play.ts';
import { report, type GameResult } from './report.ts';

const { values } = parseArgs({
  options: {
    top: { type: 'string', default: '50' },
    catalog: { type: 'string' },
    only: { type: 'string' },
    out: { type: 'string' },
    json: { type: 'string', default: 'data/survey/rendering.json' },
    cache: { type: 'string', default: 'data/cache/survey' },
  },
});

/**
 * The player (play.ts and the app's engines), bundled for Node with esbuild and the same vendor patches as the app's
 * build (scripts/build/vendor-patches.ts), then imported.
 */
async function loadPlayer(): Promise<unknown> {
  const outfile = join(mkdtempSync(join(tmpdir(), 'inkventure-survey-')), 'play.mjs');
  await build({
    entryPoints: ['scripts/survey/play.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outfile,
    logLevel: 'error',
    plugins: [
      {
        name: 'vendor-patches',
        setup(plugin) {
          plugin.onLoad({ filter: /[\\/](glkote-term|ifvms|quixe)[\\/].*\.js$/ }, (args) => {
            const code = readFileSync(args.path, 'utf8');
            for (const patch of PATCHES) {
              if (patch.id.test(args.path))
                return { contents: applyPatch(code, patch.replacements), loader: 'js' };
            }
            return undefined;
          });
        },
      },
    ],
  });
  return import(outfile);
}

async function main() {
  const dir = catalogDir(values.catalog);
  const games = parserGames(dir, values.only, Number(values.top));
  console.log('Playing ' + games.length + ' games from ' + dir);
  const { play, COMMANDS, MENU_KEYS } = (await loadPlayer()) as {
    play: (story: ArrayBuffer, kind: 'zmachine' | 'glulx') => Promise<PlayResult>;
    COMMANDS: string[];
    MENU_KEYS: string[];
  };
  const results: GameResult[] = [];
  for (const game of games) {
    const result: GameResult = {
      tuid: game.t,
      title: game.n,
      format: game.f,
      featured: game.featured,
      findings: [],
      turns: 0,
    };
    try {
      const bytes = await storyBytes(gameFile(dir, game.t), values.cache!);
      const story = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const played = await play(story, PARSER[game.f]);
      result.findings = played.findings;
      result.turns = played.turns;
    } catch (error) {
      const finding: Finding = {
        kind: 'load',
        step: 'download',
        detail: String(error).slice(0, 120),
      };
      result.findings = [finding];
    }
    console.log(
      game.n +
        ': ' +
        (result.findings.map((f) => f.kind).join(', ') || 'nothing found') +
        ' (' +
        result.turns +
        ' turns)',
    );
    results.push(result);
  }
  const date = new Date().toISOString().slice(0, 10);
  const script =
    'intro (any key), then ' +
    COMMANDS.map((c) => '`' + c + '`').join(', ') +
    ', each menu browsed with ' +
    MENU_KEYS.map((k) => (k === ' ' ? 'space' : k)).join(' ');
  const out = values.out || 'docs/reports/rendering-survey-' + date + '.md';
  writeFileSync(out, report(results, date, script));
  mkdirSync(join(values.json!, '..'), { recursive: true });
  writeFileSync(values.json!, JSON.stringify(results, null, 2));
  console.log('Report: ' + out);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
