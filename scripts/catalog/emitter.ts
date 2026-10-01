// Catalogue emitter and validation (SPEC §5.2 steps 4–5; story S2.3). Pure: turns the resolved games into the static
// files the app loads (meta.json, index-<n>.json shards of compact rows, games/<tuid>.json details) and checks them.
import type { ResolvedGame, StoryFormat } from './resolver.ts';
import starterTags from './starter-tags.json' with { type: 'json' };

/** Bump when the shape of the published files changes, so the app can refuse a catalogue it cannot read. */
export const CATALOG_VERSION = 1;

/** Rows per index shard (SPEC §5.2: ~500, each shard well under the 150 KB budget). */
export const SHARD_SIZE = 500;

/** A build publishing fewer games than this share of the previous one fails (SPEC §5.2: > 20 % drop). */
export const MIN_KEPT_SHARE = 0.8;

/**
 * Compact index row (short keys keep parsing fast on the Kindle). Optional keys are left out when unknown.
 * `fg` (forgiveness) is reserved: IFDB's JSON API does not give it (see S2.2).
 */
export interface IndexRow {
  /** TUID */
  t: string;
  /** title */
  n: string;
  /** author */
  a: string;
  /** year */
  y?: number;
  /** language (primary subtag) */
  l?: string;
  /** genres */
  g?: string[];
  /** story format */
  f: StoryFormat;
  /** average rating (1–5) */
  r?: number;
  /** number of ratings */
  rc?: number;
  /** IFDB's star sort key (rating weighted by count) */
  s?: number;
  /** play time, minutes */
  p?: number;
  /** has cover art (1) */
  c?: 1;
  /** slow on e-readers (1) */
  sl?: 1;
  /** newcomer-friendly (1): an IFDB tag of starter-tags.json; the app adds the curated starters */
  st?: 1;
  /** illustrated (1): pictures besides the cover, drawn by the engine (S2.5) */
  il?: 1;
  /** forgiveness (Merciful…Cruel), reserved: not emitted yet */
  fg?: string;
}

/** Full detail of one game, loaded when its page opens. */
export type GameDetail = Omit<ResolvedGame, 'devsys'> & { devsys?: string };

export interface Meta {
  version: number;
  /** Build date (ISO). */
  built: string;
  policy: string;
  count: number;
  /** Illustrated games (S2.5; absent from catalogues built before it). */
  illustrated?: number;
  shards: string[];
  /** Facet values with their game counts, most frequent first. */
  facets: {
    languages: Array<[string, number]>;
    genres: Array<[string, number]>;
    formats: Array<[string, number]>;
  };
}

/** Published path (relative to the catalogue directory) → JSON content. */
export type CatalogFiles = Record<string, unknown>;

/** Sort key of a title: lower case, without leading punctuation (`"Calm…"`, `**COUGH**` sort by their words). */
export function titleSortKey(title: string): string {
  return title.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '');
}

function compareTitles(a: ResolvedGame, b: ResolvedGame): number {
  const x = titleSortKey(a.title);
  const y = titleSortKey(b.title);
  return x < y ? -1 : x > y ? 1 : a.tuid < b.tuid ? -1 : a.tuid > b.tuid ? 1 : 0;
}

function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

const STARTER_TAGS = starterTags.tags.map((tag) => tag.toLowerCase());

/** Whether IFDB tags mark a newcomer-friendly game (SPEC §3.4 "Start here"). */
export function isStarter(tags: string[]): boolean {
  return tags.some((tag) => STARTER_TAGS.indexOf(tag.toLowerCase()) >= 0);
}

export function indexRow(game: ResolvedGame): IndexRow {
  const row: IndexRow = { t: game.tuid, n: game.title, a: game.author, f: game.format };
  if (game.year !== undefined) row.y = game.year;
  if (game.language) row.l = game.language;
  if (game.genres.length) row.g = game.genres;
  if (game.rating) {
    row.r = round(game.rating.average, 2);
    row.rc = game.rating.count;
  }
  if (game.starSort !== undefined) row.s = round(game.starSort, 3);
  if (game.playtimeMinutes) row.p = game.playtimeMinutes;
  if (game.cover) row.c = 1;
  if (game.slow) row.sl = 1;
  if (isStarter(game.tags)) row.st = 1;
  if (game.illustrated) row.il = 1;
  return row;
}

function facet(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * The catalogue files for `games`: rows sorted by title (stable shards), `shardSize` rows per shard. `built` is passed
 * in so the output is deterministic.
 */
export function emit(
  games: ResolvedGame[],
  options: { built: string; policy: string; shardSize?: number },
): CatalogFiles {
  const size = options.shardSize || SHARD_SIZE;
  const sorted = games.slice().sort(compareTitles);
  const files: CatalogFiles = {};
  const shards: string[] = [];
  // At least one shard, empty when no game is kept, so the app always finds the files meta.json lists.
  const count = Math.max(1, Math.ceil(sorted.length / size));
  for (let i = 0; i < count; i++) {
    const name = 'index-' + i + '.json';
    shards.push(name);
    files[name] = { rows: sorted.slice(i * size, (i + 1) * size).map(indexRow) };
  }
  for (const game of sorted) {
    const detail: GameDetail = { ...game };
    if (!detail.devsys) delete detail.devsys;
    files['games/' + game.tuid + '.json'] = detail;
  }
  const meta: Meta = {
    version: CATALOG_VERSION,
    built: options.built,
    policy: options.policy,
    count: sorted.length,
    illustrated: sorted.filter((game) => game.illustrated).length,
    shards: shards,
    facets: {
      languages: facet(sorted.map((game) => game.language || 'und')),
      genres: facet(sorted.flatMap((game) => game.genres)),
      formats: facet(sorted.map((game) => game.format)),
    },
  };
  files['meta.json'] = meta;
  return files;
}

/** Serialised form of a published file (compact: every byte counts on e-reader Wi-Fi). */
export function serialize(content: unknown): string {
  return JSON.stringify(content);
}

const TUID = /^[a-z0-9]+$/;
const FORMATS: StoryFormat[] = ['zcode', 'glulx', 'twine', 'ink'];

/** Schema check of one index row: every problem found, empty when valid. */
export function rowProblems(row: unknown): string[] {
  const problems: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const r = row as Record<string, unknown>;
  const known = [
    't',
    'n',
    'a',
    'y',
    'l',
    'g',
    'f',
    'r',
    'rc',
    's',
    'p',
    'fg',
    'c',
    'sl',
    'st',
    'il',
  ];
  for (const key of Object.keys(r)) if (known.indexOf(key) < 0) problems.push('unknown key ' + key);
  if (typeof r.t !== 'string' || !TUID.test(r.t)) problems.push('t: TUID expected');
  if (typeof r.n !== 'string' || !r.n) problems.push('n: title expected');
  if (typeof r.a !== 'string') problems.push('a: author expected');
  if (FORMATS.indexOf(r.f as StoryFormat) < 0) problems.push('f: story format expected');
  if (r.y !== undefined && !(Number.isInteger(r.y) && (r.y as number) > 1900))
    problems.push('y: year');
  if (r.l !== undefined && !(typeof r.l === 'string' && /^[a-z]{2,3}$/.test(r.l)))
    problems.push('l: language');
  if (r.g !== undefined && !(Array.isArray(r.g) && r.g.every((g) => typeof g === 'string' && g))) {
    problems.push('g: genres');
  }
  if (r.r !== undefined && !(typeof r.r === 'number' && r.r >= 0 && r.r <= 5))
    problems.push('r: rating');
  for (const key of ['rc', 'p']) {
    if (r[key] !== undefined && !(Number.isInteger(r[key]) && (r[key] as number) > 0))
      problems.push(key);
  }
  if (r.s !== undefined && typeof r.s !== 'number') problems.push('s: number');
  if (r.fg !== undefined && typeof r.fg !== 'string') problems.push('fg: string');
  for (const key of ['c', 'sl', 'st', 'il'])
    if (r[key] !== undefined && r[key] !== 1) problems.push(key + ': 1');
  return problems;
}

function detailProblems(detail: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const file = detail.file as
    { url?: unknown; archive?: { type?: unknown; primary?: unknown } } | undefined;
  if (!file || typeof file.url !== 'string' || !/^https:\/\//.test(file.url))
    problems.push('file.url: HTTPS URL');
  if (
    file &&
    file.archive &&
    !(file.archive.type === 'zip' && typeof file.archive.primary === 'string')
  ) {
    problems.push('file.archive');
  }
  if (typeof detail.ifdbLink !== 'string') problems.push('ifdbLink');
  return problems;
}

export interface Validation {
  errors: string[];
  /** Serialised size of each file, in bytes. */
  sizes: Record<string, number>;
}

/**
 * Checks the emitted files: every row and detail well formed, every indexed game has its detail, each shard under
 * `shardBudgetBytes`, and (with `previousCount`) no drop of more than 20 % of the games.
 */
export function validate(
  files: CatalogFiles,
  options: { shardBudgetBytes: number; previousCount?: number },
): Validation {
  const errors: string[] = [];
  const sizes: Record<string, number> = {};
  for (const path of Object.keys(files)) sizes[path] = Buffer.byteLength(serialize(files[path]));

  const meta = files['meta.json'] as Meta | undefined;
  if (!meta) return { errors: ['meta.json missing'], sizes: sizes };
  if (meta.version !== CATALOG_VERSION) errors.push('meta.json: version ' + meta.version);

  let rows = 0;
  let illustrated = 0;
  const seen: Record<string, boolean> = {};
  for (const shard of meta.shards) {
    const content = files[shard] as { rows?: unknown[] } | undefined;
    if (!content || !Array.isArray(content.rows)) {
      errors.push(shard + ': missing or without rows');
      continue;
    }
    if (sizes[shard] > options.shardBudgetBytes) {
      errors.push(
        `${shard}: ${sizes[shard]} bytes, over the ${options.shardBudgetBytes}-byte budget`,
      );
    }
    content.rows.forEach((row, i) => {
      for (const problem of rowProblems(row)) errors.push(`${shard} row ${i}: ${problem}`);
      const tuid = (row as IndexRow).t;
      if (seen[tuid]) errors.push(`${shard} row ${i}: duplicate ${tuid}`);
      seen[tuid] = true;
      if ((row as IndexRow).il) illustrated++;
      const detail = files['games/' + tuid + '.json'] as Record<string, unknown> | undefined;
      if (!detail) errors.push(`${shard} row ${i}: games/${tuid}.json missing`);
      else
        for (const problem of detailProblems(detail)) errors.push(`games/${tuid}.json: ${problem}`);
    });
    rows += content.rows.length;
  }
  if (rows !== meta.count) errors.push(`meta.json: count ${meta.count}, but ${rows} rows`);
  if (meta.illustrated !== undefined && meta.illustrated !== illustrated) {
    errors.push(`meta.json: ${meta.illustrated} illustrated, but ${illustrated} rows with il`);
  }
  if (options.previousCount && rows < options.previousCount * MIN_KEPT_SHARE) {
    errors.push(
      `${rows} games, down from ${options.previousCount}: more than a ${Math.round((1 - MIN_KEPT_SHARE) * 100)} % drop`,
    );
  }
  return { errors: errors, sizes: sizes };
}
