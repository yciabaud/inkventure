// Rendering survey CLI (story S7.3): plays the featured games and the most-rated parser games of the published
// catalogue headless, with the app's engines, and writes a report of what the reader may show wrong. Run by hand, never
// in CI: it downloads story files from the IF Archive (at most 1 request per second, cached in data/cache/survey/).
//
//   npm run survey:rendering -- [--top 50] [--catalog DIR] [--only TUID,…] [--out FILE] [--json FILE]
//
// The catalogue is the one the weekly workflow publishes on the `catalog` branch (fetched here), or `--catalog DIR`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';
import { build } from 'esbuild';
import { applyPatch, PATCHES } from '../build/vendor-patches.ts';
import { RateLimiter, USER_AGENT } from '../catalog/fetcher.ts';
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

interface Row {
  t: string;
  n: string;
  f: string;
  rc?: number;
}

interface GameFile {
  url: string;
  archive?: { type: string; primary: string };
}

const PARSER: Record<string, 'zmachine' | 'glulx'> = { zcode: 'zmachine', glulx: 'glulx' };
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** The published catalogue's folder: `--catalog`, else the `catalog` branch extracted to a temporary folder. */
function catalogDir(): string {
  if (values.catalog) return values.catalog;
  const dir = mkdtempSync(join(tmpdir(), 'inkventure-catalog-'));
  execFileSync('git', ['fetch', '--quiet', '--depth', '1', 'origin', 'catalog']);
  const tar = execFileSync('git', ['archive', 'FETCH_HEAD', 'catalog'], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return join(dir, 'catalog');
}

/** The games to play: the curated featured list first, then the most-rated parser games. */
function selection(dir: string): Array<Row & { featured: boolean }> {
  const meta = readJson<{ shards: string[] }>(join(dir, 'meta.json'));
  const rows: Row[] = [];
  for (const shard of meta.shards) rows.push(...readJson<{ rows: Row[] }>(join(dir, shard)).rows);
  const parser = rows.filter((row) => PARSER[row.f]);
  if (values.only) {
    const ids = values.only.split(',');
    return parser
      .filter((row) => ids.indexOf(row.t) >= 0)
      .map((row) => ({ ...row, featured: false }));
  }
  const curated = readJson<{ items: Array<{ tuid: string }> }>('content/featured.json').items.map(
    (i) => i.tuid,
  );
  const featured = parser.filter((row) => curated.indexOf(row.t) >= 0);
  const top = parser
    .filter((row) => curated.indexOf(row.t) < 0)
    .sort((a, b) => (b.rc || 0) - (a.rc || 0))
    .slice(0, Number(values.top));
  return featured
    .map((row) => ({ ...row, featured: true }))
    .concat(top.map((row) => ({ ...row, featured: false })));
}

const limiter = new RateLimiter(1000);

/** The story file, from the cache or downloaded (then cached), unzipped when the catalogue says it is a zip. */
async function storyFile(file: GameFile): Promise<ArrayBuffer> {
  const cached = join(values.cache!, createHash('sha1').update(file.url).digest('hex'));
  let bytes: Uint8Array;
  if (existsSync(cached)) {
    bytes = readFileSync(cached);
  } else {
    await limiter.wait();
    const response = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    bytes = new Uint8Array(await response.arrayBuffer());
    mkdirSync(values.cache!, { recursive: true });
    writeFileSync(cached, bytes);
  }
  if (file.archive && file.archive.type === 'zip') {
    const entries = unzipSync(bytes);
    const primary = entries[file.archive.primary];
    if (!primary) throw new Error('Not in the zip: ' + file.archive.primary);
    bytes = primary;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

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
  const dir = catalogDir();
  const games = selection(dir);
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
      const detail = readJson<{ file: GameFile }>(join(dir, 'games', game.t + '.json'));
      const story = await storyFile(detail.file);
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
