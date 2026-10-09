// Rendering survey and story-file scan (stories S7.3, S7.4): the published catalogue's parser games, and their story
// files, downloaded at most once per second and cached.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { RateLimiter, USER_AGENT } from '../catalog/fetcher.ts';

export interface Row {
  t: string;
  n: string;
  f: string;
  rc?: number;
}

export interface GameFile {
  url: string;
  archive?: { type: string; primary: string };
}

export type Selected = Row & { featured: boolean };

export const PARSER: Record<string, 'zmachine' | 'glulx'> = { zcode: 'zmachine', glulx: 'glulx' };
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** The published catalogue's folder: `dir`, else the `catalog` branch extracted to a temporary folder. */
export function catalogDir(dir?: string): string {
  if (dir) return dir;
  const tmp = mkdtempSync(join(tmpdir(), 'inkventure-catalog-'));
  execFileSync('git', ['fetch', '--quiet', '--depth', '1', 'origin', 'catalog']);
  const tar = execFileSync('git', ['archive', 'FETCH_HEAD', 'catalog'], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', tmp], { input: tar });
  return join(tmp, 'catalog');
}

/**
 * The parser games: those in `only` (tuids), else the curated featured list first, then the others by number of
 * ratings, at most `top` of them (all when `top` is undefined).
 */
export function parserGames(dir: string, only?: string, top?: number): Selected[] {
  const meta = readJson<{ shards: string[] }>(join(dir, 'meta.json'));
  const rows: Row[] = [];
  for (const shard of meta.shards) rows.push(...readJson<{ rows: Row[] }>(join(dir, shard)).rows);
  const parser = rows.filter((row) => PARSER[row.f]);
  if (only) {
    const ids = only.split(',');
    return parser
      .filter((row) => ids.indexOf(row.t) >= 0)
      .map((row) => ({ ...row, featured: false }));
  }
  const curated = readJson<{ items: Array<{ tuid: string }> }>('content/featured.json').items.map(
    (i) => i.tuid,
  );
  const featured = parser.filter((row) => curated.indexOf(row.t) >= 0);
  const others = parser
    .filter((row) => curated.indexOf(row.t) < 0)
    .sort((a, b) => (b.rc || 0) - (a.rc || 0))
    .slice(0, top === undefined ? undefined : top);
  return featured
    .map((row) => ({ ...row, featured: true }))
    .concat(others.map((row) => ({ ...row, featured: false })));
}

/** The game's file, from its page data in the catalogue. */
export function gameFile(dir: string, tuid: string): GameFile {
  return readJson<{ file: GameFile }>(join(dir, 'games', tuid + '.json')).file;
}

const limiter = new RateLimiter(1000);

// As the app does: any case (src/catalog/storyFile.ts).
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

/** The story file, from the cache or downloaded (then cached), unzipped when the catalogue says it is a zip. */
export async function storyBytes(file: GameFile, cache: string): Promise<Uint8Array> {
  const cached = join(cache, createHash('sha1').update(file.url).digest('hex'));
  let bytes: Uint8Array;
  if (existsSync(cached)) {
    bytes = readFileSync(cached);
  } else {
    await limiter.wait();
    const response = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    bytes = new Uint8Array(await response.arrayBuffer());
    mkdirSync(cache, { recursive: true });
    writeFileSync(cached, bytes);
  }
  if (file.archive && file.archive.type === 'zip') {
    // As the app does (src/catalog/storyFile.ts, extractPrimary): the file of that name, whatever its case or folder.
    const wanted = baseName(file.archive.primary);
    const entries = unzipSync(bytes, { filter: (entry) => baseName(entry.name) === wanted });
    const names = Object.keys(entries);
    const primary =
      entries[file.archive.primary] || (names.length === 1 ? entries[names[0]] : undefined);
    if (!primary) throw new Error('Not in the zip: ' + file.archive.primary);
    bytes = primary;
  }
  return bytes;
}
