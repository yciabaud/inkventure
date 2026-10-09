// Story files that open (SPEC §5.2 step 2; story S2.8). The resolver used to trust IFDB's links: some zips do not hold
// the file IFDB names (another case, a typo), some links lead to a page or are broken, and some Z-machine games are
// version 6, which ZVM does not play. The weekly build opens each Z-machine and Glulx file once, as the app would, and
// records whether it opens (and, in a zip, the path of the story when IFDB's name differs only in case or the zip
// holds a single story of the game's format); the resolver then leaves out the files that do not open. Zips are
// downloaded whole; for a bare file only its head is read (an HTTP Range request), and the start of a Blorb's
// executable chunk when it lies further. Results are cached per file, like the other checks.
import { unzipSync } from 'fflate';
import type { RawDataset } from './crawler.ts';
import type { InkExport } from './ink.ts';
import { chooseFile, type StoryFile, type StoryFormat } from './resolver.ts';

/** Formats whose files are opened: those the app plays with a VM (Z-machine, Glulx). */
export const CHECKED_FORMATS: StoryFormat[] = ['zcode', 'glulx'];

/** Z-machine versions ZVM plays. */
export const ZCODE_VERSIONS = [3, 4, 5, 8];

/** A check is reused this long: story files seldom change. */
export const STORIES_MAX_AGE_DAYS = 180;

/**
 * Version of the check: a file that failed an older one is checked again at the next run (2: a Blorb's long resource
 * index is read whole, and a bare zip is named).
 */
export const STORIES_CHECK_VERSION = 2;

/** Bytes read first from a bare file: a story's header, or a Blorb's resource index. */
export const HEAD_BYTES = 4096;

/** A Blorb's resource index needing more than this is not believed (a broken or hostile file). */
export const MAX_INDEX_BYTES = 256 * 1024;

/** A zip bigger than this is not opened (a compilation, a game shipped with its interpreter). */
export const MAX_ZIP_BYTES = 64 * 1024 * 1024;

/** Why a file does not open. */
export type StoryProblem =
  'http' | 'too-big' | 'bad-zip' | 'not-in-zip' | 'not-a-story' | 'unsupported-version';

export interface StoryEntry {
  /** Date of the check (ISO). */
  checked: string;
  /** Version of the check that failed (STORIES_CHECK_VERSION); 1 when absent. */
  v?: number;
  /** The file opens. */
  ok?: true;
  /** The story's format, when it is not the one IFDB gives (a Glulx story listed as Z-code). */
  format?: StoryFormat;
  /** Z-machine version of the story. */
  version?: number;
  /** In a zip: the path of the story, when it is not the one IFDB names. */
  primary?: string;
  /** Why it does not open. */
  problem?: StoryProblem;
  detail?: string;
  /** A network or server error: checked again at the next run (and the file kept meanwhile). */
  transient?: boolean;
}

/** File (`storyKey`) → last check. Kept on the `catalog` branch with the record cache. */
export type StoriesCache = Record<string, StoryEntry>;

/** A file to open: its URL, the file IFDB names in a zip, and the game's format. */
export interface StoryToCheck {
  url: string;
  primary?: string;
  format: StoryFormat;
  /** The games offering it (for the summary). */
  games?: Array<{ tuid: string; title: string }>;
}

/** The cache key of a file: its URL, and the file IFDB names in a zip. */
export function storyKey(file: { url: string; primary?: string }): string {
  return file.primary ? file.url + '#' + file.primary : file.url;
}

/** Whether a cached check is recent enough to reuse. */
export function isFresh(entry: StoryEntry | undefined, now: Date): boolean {
  if (!entry || entry.transient) return false;
  if (!entry.ok && (entry.v || 1) < STORIES_CHECK_VERSION) return false;
  const age = now.getTime() - new Date(entry.checked).getTime();
  return age >= 0 && age < STORIES_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

/** What the resolver needs to know of a file: whether it opens, and where the story is in a zip. */
export type StoryVerdict =
  { opens: true; primary?: string; format?: StoryFormat } | { opens: false; why: string };

/**
 * The resolver's view of the checks: a verdict per Z-machine or Glulx file, undefined when the file was not checked
 * or the check failed on the network (the file is then kept, as before).
 */
export function storyVerdictFrom(
  cache: StoriesCache,
): (file: StoryFile, format: StoryFormat) => StoryVerdict | undefined {
  return (file, format) => {
    if (CHECKED_FORMATS.indexOf(format) < 0) return undefined;
    const entry = cache[storyKey({ url: file.url, primary: file.archive && file.archive.primary })];
    if (!entry || entry.transient) return undefined;
    if (entry.ok) {
      const verdict: StoryVerdict = { opens: true };
      if (entry.primary) verdict.primary = entry.primary;
      if (entry.format) verdict.format = entry.format;
      return verdict;
    }
    return { opens: false, why: entry.problem + (entry.detail ? ': ' + entry.detail : '') };
  };
}

/** Every Z-machine and Glulx file the resolver may pick, for each game (its other files too). */
export function storiesToCheck(
  dataset: RawDataset,
  enabled: StoryFormat[],
  inkStory?: (link: InkExport) => string | null,
): StoryToCheck[] {
  const files: StoryToCheck[] = [];
  const byKey: Record<string, StoryToCheck> = {};
  for (const game of dataset.games) {
    const verdict = (file: StoryFile, format: StoryFormat) => {
      if (CHECKED_FORMATS.indexOf(format) < 0) return undefined;
      const entry: StoryToCheck = { url: file.url, format: format, games: [] };
      if (file.archive) entry.primary = file.archive.primary;
      const key = storyKey(entry);
      if (!byKey[key]) {
        byKey[key] = entry;
        files.push(entry);
      }
      const games = byKey[key].games!;
      if (!games.some((g) => g.tuid === game.tuid)) {
        games.push({ tuid: game.tuid, title: game.search.title });
      }
      return undefined;
    };
    chooseFile(game.record, game.search.devsys || '', enabled, undefined, inkStory, verdict);
  }
  return files;
}

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

/** What the first bytes of a file are. */
export type Sniffed =
  | { kind: 'zcode'; version: number }
  | { kind: 'glulx' }
  /**
   * A Blorb whose executable chunk starts at `exec`, beyond the bytes read; or whose resource index ends at `index`,
   * beyond them (a Blorb with many pictures); neither when it has no executable chunk.
   */
  | { kind: 'blorb'; exec?: number; index?: number }
  | { kind: 'page' }
  /** A zip (a link IFDB does not mark as compressed). */
  | { kind: 'zip' }
  | { kind: 'unknown' };

/**
 * Reads a story file's head: a Z-machine header (a version from 1 to 8, and high and static memory past the 64-byte
 * header), Glulx's magic number, or a Blorb (`FORM … IFRS`), whose resource index points at its executable chunk
 * (`ZCOD` or `GLUL`); when that chunk is in `bytes`, the story in it is read.
 */
export function sniffStory(bytes: Uint8Array): Sniffed {
  if (bytes.length >= 4 && ascii(bytes, 0) === 'Glul') return { kind: 'glulx' };
  if (bytes.length >= 12 && ascii(bytes, 0) === 'FORM' && ascii(bytes, 8) === 'IFRS') {
    if (bytes.length < 24 || ascii(bytes, 12) !== 'RIdx') return { kind: 'blorb' };
    const count = u32(bytes, 20);
    for (let i = 0; i < count; i++) {
      if (24 + i * 12 + 12 > bytes.length) return { kind: 'blorb', index: 24 + count * 12 };
      const at = 24 + i * 12;
      if (ascii(bytes, at) !== 'Exec') continue;
      const exec = u32(bytes, at + 8);
      if (exec + 8 + 64 > bytes.length) return { kind: 'blorb', exec: exec };
      const type = ascii(bytes, exec);
      const story = bytes.subarray(exec + 8);
      if (type === 'GLUL')
        return sniffStory(story).kind === 'glulx' ? { kind: 'glulx' } : { kind: 'unknown' };
      if (type === 'ZCOD') {
        const inner = sniffStory(story);
        return inner.kind === 'zcode' ? inner : { kind: 'unknown' };
      }
      return { kind: 'unknown' };
    }
    return { kind: 'blorb' };
  }
  if (bytes.length >= 64 && bytes[0] >= 1 && bytes[0] <= 8) {
    // High memory and static memory start after the header.
    if (u16(bytes, 4) >= 64 && u16(bytes, 14) >= 64) return { kind: 'zcode', version: bytes[0] };
  }
  if (bytes.length >= 4 && ascii(bytes, 0) === 'PK\u0003\u0004') return { kind: 'zip' };
  const text = String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 512)));
  if (/^\s*</.test(text) && /<(!doctype|html|head|body)\b/i.test(text)) return { kind: 'page' };
  return { kind: 'unknown' };
}

/**
 * Whether a story read in full or in its head opens in a game of `format`. A story of the other format opens too, in
 * its own engine: IFDB lists some Glulx games as Z-code (`format` then says so).
 */
export function storyEntry(sniffed: Sniffed, format: StoryFormat, checked: string): StoryEntry {
  if (sniffed.kind === 'zcode') {
    if (ZCODE_VERSIONS.indexOf(sniffed.version) < 0) {
      return {
        checked: checked,
        problem: 'unsupported-version',
        detail: 'version ' + sniffed.version,
        version: sniffed.version,
      };
    }
    const entry: StoryEntry = { checked: checked, ok: true, version: sniffed.version };
    if (format !== 'zcode') entry.format = 'zcode';
    return entry;
  }
  if (sniffed.kind === 'glulx') {
    const entry: StoryEntry = { checked: checked, ok: true };
    if (format !== 'glulx') entry.format = 'glulx';
    return entry;
  }
  if (sniffed.kind === 'blorb') {
    return { checked: checked, problem: 'not-a-story', detail: 'a Blorb without a story' };
  }
  if (sniffed.kind === 'page')
    return { checked: checked, problem: 'not-a-story', detail: 'a web page' };
  if (sniffed.kind === 'zip') {
    return {
      checked: checked,
      problem: 'not-a-story',
      detail: 'a zip IFDB does not name a file in',
    };
  }
  return { checked: checked, problem: 'not-a-story', detail: 'not a story file' };
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

/**
 * The story of a game of `format` in a zip: the file IFDB names (`primary`), else the only file of that name in
 * another case or folder (as the app finds it), else the only story of that format in the zip.
 */
export function zipStory(
  zip: Uint8Array,
  primary: string,
  format: StoryFormat,
  checked: string,
): StoryEntry {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch (error) {
    return { checked: checked, problem: 'bad-zip', detail: (error as Error).message };
  }
  const names = Object.keys(entries).filter((name) => !/\/$/.test(name));
  let path: string | undefined;
  if (entries[primary]) path = primary;
  else {
    const same = names.filter((name) => baseName(name) === baseName(primary));
    if (same.length === 1) path = same[0];
  }
  if (path === undefined) {
    const stories = names.filter((name) => {
      const entry = storyEntry(sniffStory(entries[name]), format, checked);
      return entry.ok && !entry.format;
    });
    if (stories.length !== 1) {
      const detail =
        `no ${primary} in ${names.length} file(s)` +
        (stories.length > 1 ? `, ${stories.length} stories` : '');
      return { checked: checked, problem: 'not-in-zip', detail: detail };
    }
    path = stories[0];
  }
  const entry = storyEntry(sniffStory(entries[path]), format, checked);
  if (entry.ok && path !== primary) entry.primary = path;
  return entry;
}

/** Part of a file, as one request gave it. */
export interface RangeResponse {
  status: number;
  /** The bytes asked for (fewer when the file is shorter). */
  bytes: Uint8Array;
}

/** Asks for `length` bytes of `url` from `start` (the whole file when `length` is undefined). */
export type FetchRange = (url: string, start: number, length?: number) => Promise<RangeResponse>;

function httpProblem(status: number, checked: string): StoryEntry {
  const entry: StoryEntry = { checked: checked, problem: 'http', detail: 'HTTP ' + status };
  if (status >= 500 || status === 429) entry.transient = true;
  return entry;
}

const ok = (status: number) => status === 200 || status === 206;

/** Opens one file the way the app would, and says whether it opens. */
export async function inspectStory(
  file: StoryToCheck,
  fetchRange: FetchRange,
  now: Date,
): Promise<StoryEntry> {
  const checked = now.toISOString();
  if (file.primary) {
    const response = await fetchRange(file.url, 0);
    if (!ok(response.status)) return httpProblem(response.status, checked);
    if (response.bytes.length > MAX_ZIP_BYTES) {
      return { checked: checked, problem: 'too-big', detail: response.bytes.length + ' bytes' };
    }
    return zipStory(response.bytes, file.primary, file.format, checked);
  }
  let head = await fetchRange(file.url, 0, HEAD_BYTES);
  if (!ok(head.status)) return httpProblem(head.status, checked);
  let sniffed = sniffStory(head.bytes);
  if (sniffed.kind === 'blorb' && sniffed.index !== undefined && sniffed.index <= MAX_INDEX_BYTES) {
    // A long resource index (many pictures): asked again, whole.
    head = await fetchRange(file.url, 0, sniffed.index);
    if (!ok(head.status)) return httpProblem(head.status, checked);
    sniffed = sniffStory(head.bytes);
  }
  if (sniffed.kind === 'blorb' && sniffed.exec !== undefined) {
    // The executable chunk lies further: its header and the story's.
    const exec = sniffed.exec;
    const part = await fetchRange(file.url, exec, 8 + 64);
    if (!ok(part.status)) return httpProblem(part.status, checked);
    const type = part.bytes.length >= 8 ? ascii(part.bytes, 0) : '';
    const story = sniffStory(part.bytes.subarray(8));
    sniffed =
      (type === 'ZCOD' && story.kind === 'zcode') || (type === 'GLUL' && story.kind === 'glulx')
        ? story
        : { kind: 'unknown' };
  }
  return storyEntry(sniffed, file.format, checked);
}
