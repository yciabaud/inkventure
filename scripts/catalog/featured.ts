// Featured selection (SPEC §5.3; story S2.4). Pure: checks the hand-curated `content/featured.json` against a
// catalogue, and builds the catalogue's `featured.json`, one list per UI locale: the curated games in that language
// first (with their pitch), then the best-rated games in that language. The app leaves out the games already in
// progress, so each list holds more games than the shelf shows.
import type { CatalogFiles, IndexRow, Meta } from './emitter.ts';
import type { ContentPolicyConfig } from './resolver.ts';

/** Bump when the shape of the curated file or of the published `featured.json` changes. */
export const FEATURED_VERSION = 1;

/** A pitch is one line on the Home shelf and on an ebook card. */
export const MAX_PITCH_LENGTH = 140;

/** Best-rated games listed per locale after the curated ones. */
export const TOP_RATED_COUNT = 24;

/** Best-rated games need at least this average rating (IFDB stars, 1–5)… */
export const MIN_TOP_RATING = 3;

/** …from at least this many ratings. */
export const MIN_TOP_RATINGS = 1;

/** One entry of `content/featured.json`. */
export interface CuratedItem {
  tuid: string;
  /** Newcomer-friendly: "Start here" badge. */
  starter?: boolean;
  /** One-line pitch per UI locale. */
  pitch: Record<string, string>;
}

export interface CuratedFile {
  version: number;
  items: CuratedItem[];
}

/**
 * A game of a featured list: its index row (whose `st` starter flag comes from IFDB tags) plus the pitch (`pi`,
 * curated games only); curated starters get `st` too.
 */
export type FeaturedRow = IndexRow & { pi?: string };

/** The published `featured.json`. */
export interface FeaturedFile {
  version: number;
  /** Build date of the catalogue it was made from. */
  built: string;
  /** UI locale → games, curated first, then best rated. */
  locales: Record<string, FeaturedRow[]>;
}

/** What the checks need from a catalogue: its rows, and the tags of the curated games (from their details). */
export interface CatalogView {
  policy: string;
  rows: IndexRow[];
  tags: (tuid: string) => string[] | undefined;
}

/** Reads the rows of a catalogue given as its files (as emitted, or read back from disk). */
export function catalogView(files: CatalogFiles): CatalogView {
  const meta = files['meta.json'] as Meta;
  let rows: IndexRow[] = [];
  for (const shard of meta.shards) rows = rows.concat((files[shard] as { rows: IndexRow[] }).rows);
  return {
    policy: meta.policy,
    rows: rows,
    tags: (tuid) => {
      const detail = files['games/' + tuid + '.json'] as { tags?: string[] } | undefined;
      return detail ? detail.tags || [] : undefined;
    },
  };
}

const TUID = /^[a-z0-9]+$/;

/**
 * Schema checks of the curated file alone (no catalogue): version, known keys, TUIDs, no duplicate, a non-empty
 * one-line pitch for every UI locale and no other. Every problem found, empty when valid.
 */
export function curatedProblems(content: unknown, locales: string[]): string[] {
  if (!content || typeof content !== 'object') return ['not an object'];
  const file = content as Record<string, unknown>;
  const problems: string[] = [];
  if (file.version !== FEATURED_VERSION)
    problems.push('version: ' + FEATURED_VERSION + ' expected');
  if (!Array.isArray(file.items)) return problems.concat('items: array expected');
  const seen: Record<string, boolean> = {};
  file.items.forEach((entry: unknown, i: number) => {
    const at = 'items[' + i + ']';
    if (!entry || typeof entry !== 'object') {
      problems.push(at + ': not an object');
      return;
    }
    const item = entry as Record<string, unknown>;
    for (const key of Object.keys(item)) {
      if (['tuid', 'starter', 'pitch'].indexOf(key) < 0) problems.push(at + ': unknown key ' + key);
    }
    if (typeof item.tuid !== 'string' || !TUID.test(item.tuid)) {
      problems.push(at + ': tuid expected');
    } else {
      if (seen[item.tuid]) problems.push(at + ': duplicate ' + item.tuid);
      seen[item.tuid] = true;
    }
    if (item.starter !== undefined && typeof item.starter !== 'boolean') {
      problems.push(at + ': starter must be true or false');
    }
    const pitch = item.pitch as Record<string, unknown> | undefined;
    if (!pitch || typeof pitch !== 'object') {
      problems.push(at + ': pitch expected');
      return;
    }
    for (const locale of locales) {
      const text = pitch[locale];
      if (typeof text !== 'string' || !text.trim())
        problems.push(at + ': pitch.' + locale + ' missing');
      else if (text.length > MAX_PITCH_LENGTH) {
        problems.push(`${at}: pitch.${locale} longer than ${MAX_PITCH_LENGTH} characters`);
      } else if (/[\r\n]/.test(text)) problems.push(at + ': pitch.' + locale + ' on several lines');
    }
    for (const locale of Object.keys(pitch)) {
      if (locales.indexOf(locale) < 0)
        problems.push(at + ': pitch.' + locale + ' is not a UI locale');
    }
  });
  return problems;
}

/**
 * Why a curated game cannot be featured from this catalogue, or undefined when it can: it must be in the index (so
 * playable and allowed by the content policy), not excluded by hand, without a denied tag under the general policy,
 * and in one of the UI locales (the shelf only shows games in the reader's language).
 */
export function unfeaturable(
  tuid: string,
  catalog: CatalogView,
  policy: ContentPolicyConfig,
  locales: string[],
): string | undefined {
  for (const entry of policy.exclude)
    if (entry.tuid === tuid) return 'excluded (' + entry.reason + ')';
  let row: IndexRow | undefined;
  for (const r of catalog.rows) if (r.t === tuid) row = r;
  if (!row) return 'not in the catalogue (unknown or not playable)';
  if (catalog.policy === 'general') {
    const deny = policy.denyTags.map((tag) => tag.toLowerCase());
    for (const tag of catalog.tags(tuid) || []) {
      if (deny.indexOf(tag.toLowerCase()) >= 0) return 'adult content (tag "' + tag + '")';
    }
  }
  if (!row.l || locales.indexOf(row.l) < 0) {
    return 'in language "' + (row.l || 'und') + '", not a UI locale: never shown';
  }
  return undefined;
}

/** Full check of the curated file against a catalogue: schema problems, then one per game that cannot be featured. */
export function featuredProblems(
  content: unknown,
  catalog: CatalogView,
  policy: ContentPolicyConfig,
  locales: string[],
): string[] {
  const problems = curatedProblems(content, locales);
  if (problems.length) return problems;
  (content as CuratedFile).items.forEach((item, i) => {
    const why = unfeaturable(item.tuid, catalog, policy, locales);
    if (why) problems.push(`items[${i}] ${item.tuid}: ${why}`);
  });
  return problems;
}

/** Ranking of the best-rated games: IFDB's star sort (rating weighted by count), then count, then TUID (stable). */
function byStars(a: IndexRow, b: IndexRow): number {
  return (
    (b.s || 0) - (a.s || 0) || (b.rc || 0) - (a.rc || 0) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)
  );
}

/**
 * Builds the published `featured.json`. The curated file must pass `curatedProblems`; curated games that cannot be
 * featured from this catalogue are left out and returned in `skipped` (the deployment goes on; CI flags them).
 */
export function buildFeatured(
  content: CuratedFile,
  catalog: CatalogView,
  policy: ContentPolicyConfig,
  locales: string[],
  built: string,
): { file: FeaturedFile; skipped: string[] } {
  const byTuid: Record<string, IndexRow> = {};
  for (const row of catalog.rows) byTuid[row.t] = row;
  const skipped: string[] = [];
  const curated: Record<string, boolean> = {};
  const lists: Record<string, FeaturedRow[]> = {};
  for (const locale of locales) lists[locale] = [];

  for (const item of content.items) {
    const why = unfeaturable(item.tuid, catalog, policy, locales);
    if (why) {
      skipped.push(item.tuid + ': ' + why);
      continue;
    }
    curated[item.tuid] = true;
    const row = byTuid[item.tuid];
    const featured: FeaturedRow = { ...row, pi: item.pitch[row.l as string] };
    if (item.starter) featured.st = 1;
    lists[row.l as string].push(featured);
  }

  const top = catalog.rows
    .filter(
      (row) =>
        !curated[row.t] &&
        (row.r || 0) >= MIN_TOP_RATING &&
        (row.rc || 0) >= MIN_TOP_RATINGS &&
        !!row.l &&
        locales.indexOf(row.l) >= 0,
    )
    .sort(byStars);
  for (const locale of locales) {
    lists[locale] = lists[locale].concat(
      top.filter((row) => row.l === locale).slice(0, TOP_RATED_COUNT),
    );
  }
  return { file: { version: FEATURED_VERSION, built: built, locales: lists }, skipped: skipped };
}
