// Playability resolution and content policy (SPEC §5.2 steps 2–3, §5.4; story S2.2). Pure: turns the crawler's raw
// dataset (data/raw/games.json) into the games the app can play, with the reason for every game left out.
import type { GameRecord } from './ifdb.ts';
import type { RawDataset, RawGame } from './crawler.ts';
import { isCandidate, MIN_PICTURES } from './pictures.ts';

/** Story formats the app knows. A format plays once its engine exists; `enabledFormats` lists those. */
export type StoryFormat = 'zcode' | 'glulx' | 'twine' | 'ink';

const ALL_FORMATS: StoryFormat[] = ['zcode', 'glulx', 'twine', 'ink'];

/** IFDB file format ids (`downloads.links[].format`, IFDB's "externid") of each story format. */
const IFDB_FORMATS: Record<string, StoryFormat> = {
  zcode: 'zcode',
  'blorb/zcode': 'zcode',
  glulx: 'glulx',
  'blorb/glulx': 'glulx',
};

/** Story file extensions, for links whose format IFDB does not know. */
const EXTENSIONS: Array<[RegExp, StoryFormat, boolean]> = [
  [/\.(zblorb|zlb)$/i, 'zcode', true],
  [/\.z[1-8]$/i, 'zcode', false],
  [/\.(gblorb|glb)$/i, 'glulx', true],
  [/\.ulx$/i, 'glulx', false],
];

/** Development systems whose HTML output is a Twine story (story formats included). */
const TWINE_SYSTEMS = /twine|harlowe|sugarcube|snowman|chapbook/i;
const INK_SYSTEMS = /\bink(le)?\b/i;

export type DropReason =
  | 'no-game-file'
  | 'unsupported-format'
  | 'format-not-enabled'
  | 'compressed-no-primary'
  | 'insecure-url'
  | 'unreadable-host'
  | 'adult-content'
  | 'excluded';

export interface ContentPolicyConfig {
  /** Tags (case-insensitive) that exclude a game from a `general` build. */
  denyTags: string[];
  /** Games left out by hand, whatever the policy (untagged adult content, broken files…). */
  exclude: Array<{ tuid: string; reason: string }>;
}

export type ContentPolicy = 'general' | 'adult';

export interface ResolveOptions {
  enabledFormats: StoryFormat[];
  policy: ContentPolicy;
  config: ContentPolicyConfig;
  /**
   * Whether the app can read a file outside the IF Archive from the browser (its host sends CORS headers; checked by
   * `check-cors.ts`). Without it, every host is assumed readable (fixtures, local runs).
   */
  readable?: (url: string) => boolean;
  /**
   * Pictures besides the cover in a story file, when `pictures.ts` could read its Blorb index (undefined otherwise).
   * Without it, no game is illustrated.
   */
  pictures?: (url: string) => number | undefined;
}

/** The file the app downloads. `archive`: the story is `primary` inside a zip. */
export interface StoryFile {
  url: string;
  /** IFDB's format id of the link, when it has one (e.g. `blorb/zcode`). */
  ifdbFormat?: string;
  archive?: { type: 'zip'; primary: string };
}

export interface ResolvedGame {
  tuid: string;
  title: string;
  author: string;
  /** Year of first publication. */
  year?: number;
  /** Primary language subtag (`en`, `fr`…), when IFDB knows it. */
  language?: string;
  genres: string[];
  format: StoryFormat;
  file: StoryFile;
  ifids: string[];
  tags: string[];
  rating?: { average: number; stars: number; count: number };
  starSort?: number;
  playtimeMinutes?: number;
  /** Cover art URL (versioned); the app asks for a thumbnail of it. */
  cover?: string;
  /** "May be slow" badge: no game for now (Glulx turns measured on the Kindle within the < 3 s target, S1.7). */
  slow: boolean;
  /** Its Blorb holds at least MIN_PICTURES pictures besides the cover, in a format whose engine draws them (S2.5). */
  illustrated?: true;
  /** Pictures besides the cover, for an illustrated game. */
  pictures?: number;
  devsys: string;
  description?: string;
  ifdbLink: string;
}

export interface Dropped {
  tuid: string;
  title: string;
  reason: DropReason;
  detail?: string;
}

export interface Resolution {
  policy: ContentPolicy;
  enabledFormats: StoryFormat[];
  games: ResolvedGame[];
  dropped: Dropped[];
  /**
   * Counts of dropped games per reason, of playable files per format (enabled or not), and of the kept games whose
   * Blorb could have pictures (`blorbs`), was inspected (`inspected`) and is illustrated.
   */
  counts: {
    kept: number;
    dropped: Partial<Record<DropReason, number>>;
    formats: Record<string, number>;
    pictures: { blorbs: number; inspected: number; illustrated: number };
  };
}

interface Link {
  url: string;
  format?: string;
  isGame?: boolean;
  compression?: string;
  compressedPrimary?: string;
}

interface Candidate {
  format: StoryFormat;
  file: StoryFile;
  blorb: boolean;
  onArchive: boolean;
  compressed: boolean;
  index: number;
}

const IF_ARCHIVE_HOST = /(^|\.)ifarchive\.org$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** HTTPS URL of a link: IF Archive links are upgraded; other plain-HTTP links cannot be fetched from HTTPS pages. */
export function secureUrl(url: string): string | undefined {
  if (/^https:\/\//i.test(url)) return url;
  if (/^http:\/\//i.test(url) && IF_ARCHIVE_HOST.test(hostOf(url))) {
    return 'https://' + url.slice('http://'.length);
  }
  return undefined;
}

/** Story format of a download link, from IFDB's format id, else the file name and the development system. */
export function linkFormat(
  link: Link,
  devsys: string,
): { format: StoryFormat; blorb: boolean } | undefined {
  const name = (link.compressedPrimary || link.url).split(/[?#]/)[0];
  if (link.format && IFDB_FORMATS[link.format]) {
    return {
      format: IFDB_FORMATS[link.format],
      blorb: /^blorb\//.test(link.format) || /blorb$|\.[zg]lb$/i.test(name),
    };
  }
  for (const [pattern, format, blorb] of EXTENSIONS) {
    if (pattern.test(name)) return { format: format, blorb: blorb };
  }
  if (link.format === 'hypertextgame' && /\.html?$/i.test(name) && TWINE_SYSTEMS.test(devsys)) {
    return { format: 'twine', blorb: false };
  }
  // A compiled ink story is JSON (the inkjs runtime plays it); web exports of ink games are not.
  if (INK_SYSTEMS.test(devsys) && /\.json$/i.test(name)) return { format: 'ink', blorb: false };
  return undefined;
}

type Choice = { file: Candidate } | { reason: DropReason; detail?: string };

/**
 * The best playable file of a record. Preference: an enabled format (in `enabledFormats` order), the IF Archive
 * (its CORS headers are verified, SPEC §5.5), an uncompressed file, a blorb (with its cover and metadata), then
 * IFDB's order. A zip is only usable when IFDB names the story file inside it (`compressedPrimary`). With
 * `readable`, a file outside the IF Archive is only used when there is no IF Archive file and its host lets the app
 * read it (CORS, SPEC §5.5); `readable` is asked about those files only.
 */
export function chooseFile(
  record: GameRecord,
  devsys: string,
  enabled: StoryFormat[],
  readable?: (url: string) => boolean,
): Choice {
  const links = ((record.ifdb.downloads && record.ifdb.downloads.links) || []) as Link[];
  const candidates: Candidate[] = [];
  const problems: Array<{ reason: DropReason; detail: string }> = [];
  let gameLinks = 0;
  links.forEach((link, index) => {
    const detected = link.url ? linkFormat(link, devsys) : undefined;
    if (!detected && !link.isGame) return;
    gameLinks++;
    if (!detected) {
      problems.push({ reason: 'unsupported-format', detail: link.format || link.url });
      return;
    }
    if (link.compression && !(link.compression === 'zip' && link.compressedPrimary)) {
      problems.push({ reason: 'compressed-no-primary', detail: link.url });
      return;
    }
    const url = secureUrl(link.url);
    if (!url) {
      problems.push({ reason: 'insecure-url', detail: link.url });
      return;
    }
    const file: StoryFile = { url: url };
    if (link.format) file.ifdbFormat = link.format;
    if (link.compression) file.archive = { type: 'zip', primary: link.compressedPrimary! };
    candidates.push({
      format: detected.format,
      file: file,
      blorb: detected.blorb,
      onArchive: IF_ARCHIVE_HOST.test(hostOf(url)),
      compressed: !!link.compression,
      index: index,
    });
  });

  if (!gameLinks) return { reason: 'no-game-file' };
  const usable = candidates.filter((c) => enabled.indexOf(c.format) >= 0);
  if (!usable.length) {
    if (candidates.length) {
      return {
        reason: 'format-not-enabled',
        detail: unique(candidates.map((c) => c.format)).join(', '),
      };
    }
    // Report the most telling problem: an unknown format hides the others.
    const order: DropReason[] = ['unsupported-format', 'compressed-no-primary', 'insecure-url'];
    problems.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
    return { reason: problems[0].reason, detail: problems[0].detail };
  }
  usable.sort(
    (a, b) =>
      enabled.indexOf(a.format) - enabled.indexOf(b.format) ||
      Number(b.onArchive) - Number(a.onArchive) ||
      Number(a.compressed) - Number(b.compressed) ||
      Number(b.blorb) - Number(a.blorb) ||
      a.index - b.index,
  );
  if (readable && !usable.some((c) => c.onArchive)) {
    const reachable = usable.filter((c) => readable(c.file.url));
    if (!reachable.length) return { reason: 'unreadable-host', detail: usable[0].file.url };
    return { file: reachable[0] };
  }
  return { file: usable[0] };
}

/** The files outside the IF Archive that the choice of a game's file depends on (to check with `check-cors.ts`). */
export function urlsToCheck(record: GameRecord, devsys: string, enabled: StoryFormat[]): string[] {
  const urls: string[] = [];
  chooseFile(record, devsys, enabled, (url) => {
    urls.push(url);
    return false;
  });
  return urls;
}

function unique<T>(items: T[]): T[] {
  return items.filter((item, i) => items.indexOf(item) === i);
}

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  german: 'de',
  deutsch: 'de',
  spanish: 'es',
  castilian: 'es',
  español: 'es',
  italian: 'it',
  italiano: 'it',
  portuguese: 'pt',
  dutch: 'nl',
  russian: 'ru',
  swedish: 'sv',
  polish: 'pl',
  czech: 'cs',
  japanese: 'ja',
  chinese: 'zh',
};

/**
 * Primary language subtag of IFDB's language field: `en-US` → `en`, `fr` → `fr`. IFDB gives the whole field when it
 * has no code in brackets (e.g. `English`), so common language names are mapped too. Several languages: the first.
 */
export function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const whole = value.trim().toLowerCase();
  // Several languages keep their codes together at the end: `Castilian, English (es, en)`.
  const bracketed = /\(([a-z]{2,3})(?:-[a-z0-9]+)*(?:\s*,[^)]*)?\)$/.exec(whole);
  if (bracketed) return bracketed[1];
  const first = whole.split(/[,;/]/)[0].trim();
  const code = /^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/.exec(first);
  if (code && !LANGUAGE_NAMES[first]) return code[1];
  return LANGUAGE_NAMES[first.replace(/\s*\(.*\)$/, '')];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/**
 * Plain text of an IFDB text field: IFDB HTML-escapes titles and authors in its JSON (`Lock &amp; Key`,
 * `&quot;Calm, Mute, Moving&quot;`). Named entities above and numeric ones are decoded; others are left as they are.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name.charAt(0) === '#') {
      const code =
        name.charAt(1).toLowerCase() === 'x'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : entity;
    }
    const decoded = ENTITIES[name.toLowerCase()];
    return decoded === undefined ? entity : decoded;
  });
}

/** IFDB genres are free text, sometimes several (`Fantasy / Humor`, `Horror, Mystery`). */
export function normalizeGenres(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return unique(
    value
      .split(/\s*[/,;|]\s*/)
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0),
  );
}

export function yearOf(value: unknown): number | undefined {
  const match = typeof value === 'string' ? /^(\d{4})/.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}

function tagNames(record: GameRecord): string[] {
  const tags = record.ifdb.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) =>
      tag && typeof tag === 'object' ? String((tag as { name?: unknown }).name || '') : '',
    )
    .filter((name) => name.length > 0);
}

/** Why the content policy leaves a game out, if it does. The manual exclude list applies to every policy. */
export function policyReason(
  tuid: string,
  tags: string[],
  policy: ContentPolicy,
  config: ContentPolicyConfig,
): { reason: DropReason; detail: string } | undefined {
  const excluded = config.exclude.filter((entry) => entry.tuid === tuid)[0];
  if (excluded) return { reason: 'excluded', detail: excluded.reason };
  if (policy === 'adult') return undefined;
  const deny = config.denyTags.map((tag) => tag.toLowerCase());
  const hit = tags.filter((tag) => deny.indexOf(tag.toLowerCase()) >= 0)[0];
  return hit ? { reason: 'adult-content', detail: hit } : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) ? n : undefined;
}

function resolveGame(game: RawGame, file: Candidate, tags: string[]): ResolvedGame {
  const record = game.record;
  const bib = (record.bibliographic || {}) as Record<string, unknown>;
  const ifdb = record.ifdb as Record<string, unknown>;
  const search = game.search;
  const resolved: ResolvedGame = {
    tuid: game.tuid,
    title: decodeEntities(str(bib.title) || search.title),
    author: decodeEntities(str(bib.author) || search.author),
    genres: normalizeGenres(typeof bib.genre === 'string' ? decodeEntities(bib.genre) : bib.genre),
    format: file.format,
    file: file.file,
    ifids: (record.identification && record.identification.ifids) || [],
    tags: tags,
    slow: false,
    devsys: search.devsys || '',
    ifdbLink: str(ifdb.link) || search.link,
  };
  const year = yearOf(bib.firstpublished) ?? yearOf(search.published && search.published.machine);
  if (year !== undefined) resolved.year = year;
  const language = normalizeLanguage(bib.language);
  if (language) resolved.language = language;
  const average = num(ifdb.averageRating);
  const count = num(ifdb.ratingCountAvg) ?? num(search.numRatings);
  if (average !== undefined && count) {
    resolved.rating = {
      average: average,
      stars: num(ifdb.starRating) ?? Math.round(average * 2) / 2,
      count: count,
    };
  }
  const starSort = num(search.starSort);
  if (starSort !== undefined) resolved.starSort = starSort;
  const playtime = num(ifdb.playTimeInMinutes) ?? num(search.playTimeInMinutes);
  if (playtime) resolved.playtimeMinutes = playtime;
  const cover = ifdb.coverart as { url?: unknown } | undefined;
  if (cover && str(cover.url)) resolved.cover = cover.url as string;
  const description = str(bib.description);
  if (description) resolved.description = description;
  return resolved;
}

/** Keeps the playable games allowed by the content policy; every other game is listed with its reason. */
export function resolve(dataset: RawDataset, options: ResolveOptions): Resolution {
  const result: Resolution = {
    policy: options.policy,
    enabledFormats: options.enabledFormats,
    games: [],
    dropped: [],
    counts: {
      kept: 0,
      dropped: {},
      formats: {},
      pictures: { blorbs: 0, inspected: 0, illustrated: 0 },
    },
  };
  const drop = (game: RawGame, reason: DropReason, detail?: string) => {
    const entry: Dropped = { tuid: game.tuid, title: game.search.title, reason: reason };
    if (detail) entry.detail = detail;
    result.dropped.push(entry);
    result.counts.dropped[reason] = (result.counts.dropped[reason] || 0) + 1;
  };

  for (const game of dataset.games) {
    const tags = tagNames(game.record).map(decodeEntities);
    const blocked = policyReason(game.tuid, tags, options.policy, options.config);
    if (blocked) {
      drop(game, blocked.reason, blocked.detail);
      continue;
    }
    const choice = chooseFile(game.record, game.search.devsys || '', ALL_FORMATS);
    if ('reason' in choice) {
      drop(game, choice.reason, choice.detail);
      continue;
    }
    result.counts.formats[choice.file.format] =
      (result.counts.formats[choice.file.format] || 0) + 1;
    const enabledChoice = chooseFile(
      game.record,
      game.search.devsys || '',
      options.enabledFormats,
      options.readable,
    );
    if ('reason' in enabledChoice) {
      drop(game, enabledChoice.reason, enabledChoice.detail);
      continue;
    }
    const resolved = resolveGame(game, enabledChoice.file, tags);
    if (isCandidate(resolved)) {
      const counts = result.counts.pictures;
      counts.blorbs++;
      const pictures = options.pictures ? options.pictures(resolved.file.url) : undefined;
      if (pictures !== undefined) counts.inspected++;
      if (pictures !== undefined && pictures >= MIN_PICTURES) {
        resolved.illustrated = true;
        resolved.pictures = pictures;
        counts.illustrated++;
      }
    }
    result.games.push(resolved);
  }
  result.counts.kept = result.games.length;
  return result;
}
