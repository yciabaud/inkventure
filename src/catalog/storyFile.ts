// Story files (SPEC §5.5; story S3.4): downloaded at play time from the URL in `games/<tuid>.json` (the IF Archive
// sends CORS headers, verified on a Kindle in S0.3), unzipped when the catalogue says so, and kept in storage when
// small (src/storage/files.ts).
import { strFromU8, strToU8, unzipSync } from 'fflate';
import type { StoryFile } from '../../scripts/catalog/resolver';
import { deckText } from '../engines/decker/deckerHtml';
import type { EngineKind } from '../engines/engine';
import { looksLikeStory } from '../engines/formats';
import { cacheFile, readCachedStory, type StoryData, type StoryFiles } from '../storage/files';
import type { Store } from '../storage/store';
import { inkStoryJson } from './inkStory';
import { storyFileError, type StoryFileError } from './storyFileError';

export { isStoryFileError, storyFileError, type StoryFileError } from './storyFileError';

export type { StoryData, StoryFile, StoryFiles };

/** Bytes received so far and the file size (0 when the host does not say). */
export type DownloadProgress = (loaded: number, total: number) => void;

/** A download is abandoned after this long without receiving anything (not after a fixed time: Wi-Fi can be slow). */
export const STALL_TIMEOUT_MS = 30000;

export interface Download {
  promise: Promise<Uint8Array>;
  abort(): void;
}

interface DownloadOptions {
  onProgress?: DownloadProgress;
  stallTimeoutMs?: number;
  /** For tests. */
  createXhr?: () => XMLHttpRequest;
}

/**
 * GET `url` as bytes, over XHR (`arraybuffer` works on the Kindle baseline; its progress events drive the progress
 * page). Rejects with a `StoryFileError`; `abort()` leaves the promise pending.
 */
export function download(url: string, options: DownloadOptions = {}): Download {
  const xhr = options.createXhr ? options.createXhr() : new XMLHttpRequest();
  const stall = options.stallTimeoutMs || STALL_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;

  const promise = new Promise<Uint8Array>((resolve, reject) => {
    function finish(error: StoryFileError | null, bytes?: Uint8Array) {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      if (error) reject(error);
      else resolve(bytes as Uint8Array);
    }
    function watch() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        finish(storyFileError('timeout', 'No data for ' + stall + ' ms: ' + url));
        xhr.abort();
      }, stall);
    }

    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onprogress = (event) => {
      watch();
      if (options.onProgress) {
        options.onProgress(event.loaded, event.lengthComputable ? event.total : 0);
      }
    };
    xhr.onload = () => {
      const response = xhr.response as ArrayBuffer | null;
      const size = response ? response.byteLength : 0;
      // Status 0 with a body: a file:// page.
      if (xhr.status === 200 || (xhr.status === 0 && size > 0)) {
        finish(null, new Uint8Array(response as ArrayBuffer));
      } else if (xhr.status === 0) {
        finish(storyFileError('network', 'Network error: ' + url));
      } else {
        finish(storyFileError('http', 'HTTP ' + xhr.status + ' for ' + url, xhr.status));
      }
    };
    xhr.onerror = () => finish(storyFileError('network', 'Network error: ' + url));
    xhr.send();
    watch();
  });

  return {
    promise: promise,
    abort() {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      xhr.abort();
    },
  };
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase();
}

/**
 * The `primary` story file of a zip (the path IFDB names). Zips built on other systems may differ in case or folder,
 * so a unique entry of the same name (any case, any folder) is accepted too.
 */
export function extractPrimary(zip: Uint8Array, primary: string): Uint8Array {
  const wanted = baseName(primary);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, { filter: (file) => baseName(file.name) === wanted });
  } catch (error) {
    throw storyFileError('format', 'Not a zip file: ' + (error as Error).message);
  }
  if (entries[primary]) return entries[primary];
  const names = Object.keys(entries);
  if (names.length === 1) return entries[names[0]];
  throw storyFileError('format', 'No single "' + primary + '" in the zip');
}

/** Files of a Twine zip the frame can use (story S1.11): pictures, fonts, styles and scripts. Audio and video are not. */
const KEPT_FILE = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf|css|js)$/i;

/** At most this many bytes of a story's files are kept (unpacked), to spare the e-reader's memory. */
export const MAX_STORY_FILES_BYTES = 8 * 1024 * 1024;

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

/**
 * Orders a story's files by their first reference: in the story's page first, then in its kept styles and scripts;
 * files never named come last, by path.
 */
function byReference(page: string, files: StoryFiles): string[] {
  const paths = Object.keys(files).sort();
  const texts = paths
    .filter((path) => /\.(css|js)$/i.test(path))
    .map((path) => strFromU8(files[path]).toLowerCase());
  const lower = page.toLowerCase();
  const rank = (path: string): number => {
    const name = path.toLowerCase();
    const at = lower.indexOf(name);
    if (at >= 0) return at;
    let offset = lower.length;
    for (const text of texts) {
      // A style or script names its files relative to itself: match the end of the path.
      const own = text.indexOf(name.slice(name.indexOf('/') + 1));
      if (own >= 0) return offset + own;
      offset += text.length;
    }
    return Infinity;
  };
  const ranks: Record<string, number> = {};
  for (const path of paths) ranks[path] = rank(path);
  return paths.sort((a, b) => ranks[a] - ranks[b] || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A Twine story from its zip, with the files of the primary's folder the frame can use (story S1.11), up to
 * MAX_STORY_FILES_BYTES in their order of reference; the rest are dropped, with a warning.
 */
export function extractTwine(zip: Uint8Array, primary: string): StoryData {
  const wanted = baseName(primary);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter: (file) => baseName(file.name) === wanted || KEPT_FILE.test(file.name),
    });
  } catch (error) {
    throw storyFileError('format', 'Not a zip file: ' + (error as Error).message);
  }
  let found = entries[primary] ? primary : '';
  if (!found) {
    const named = Object.keys(entries).filter((name) => baseName(name) === wanted);
    if (named.length !== 1)
      throw storyFileError('format', 'No single "' + primary + '" in the zip');
    found = named[0];
  }
  const folder = folderOf(found);
  const files: StoryFiles = {};
  for (const name of Object.keys(entries)) {
    if (name !== found && name.indexOf(folder) === 0 && KEPT_FILE.test(name) && !/\/$/.test(name)) {
      files[name.slice(folder.length)] = entries[name];
    }
  }
  const bytes = entries[found];
  const kept: StoryFiles = {};
  const dropped: string[] = [];
  let total = 0;
  for (const path of byReference(strFromU8(bytes), files)) {
    if (total + files[path].length <= MAX_STORY_FILES_BYTES) {
      kept[path] = files[path];
      total += files[path].length;
    } else dropped.push(path);
  }
  if (dropped.length)
    console.warn('Story files over the size limit, not loaded: ' + dropped.join(', '));
  return { bytes: bytes, files: kept };
}

/**
 * The compiled story of an ink game (story S2.7): the file itself when it is the `.json`, else the object assigned to
 * `storyContent` in a web export's script or page, read as JSON (the export's scripts are not run).
 */
export function inkStory(bytes: Uint8Array): Uint8Array {
  const json = inkStoryJson(strFromU8(bytes));
  if (json === null) throw storyFileError('format', 'Not a story file: no compiled ink story');
  return strToU8(json);
}

/** The deck of a Decker game (story S2.9): the deck file itself, or the deck out of a web export's page. */
export function deckerDeck(bytes: Uint8Array): Uint8Array {
  const deck = deckText(strFromU8(bytes));
  if (deck === null) throw storyFileError('format', 'Not a story file: no Decker deck');
  return strToU8(deck);
}

/**
 * The story itself from the downloaded bytes: unzipped when the catalogue says the file is a zip, with its files for
 * a Twine story; the compiled story out of an ink web export; the deck out of a Decker web export.
 */
export function storyData(file: StoryFile, kind: EngineKind, bytes: Uint8Array): StoryData {
  const zipped = !!file.archive && file.archive.type === 'zip';
  if (kind === 'twine' && zipped) return extractTwine(bytes, file.archive!.primary);
  const story = zipped ? extractPrimary(bytes, file.archive!.primary) : bytes;
  return {
    bytes: kind === 'ink' ? inkStory(story) : kind === 'decker' ? deckerDeck(story) : story,
  };
}

interface FetchOptions extends DownloadOptions {
  /** Runs the cache write; by default a little later, so it does not delay the start of the game. */
  defer?: (write: () => void) => void;
  /**
   * Keeps the story offline (S5.3) instead of caching it, when it resolves true; run at the same moment as the cache
   * write would be.
   */
  keep?: (story: StoryData) => Promise<boolean>;
}

/** Delay before a downloaded file is written to the cache (deflating it is slow on an e-reader). */
const CACHE_DELAY_MS = 2000;

/**
 * The story of a catalogue game (with its files, for a zipped Twine story): from the cache when it holds this file,
 * else downloaded (and unzipped), checked against the engine's format and cached when small, or kept offline
 * (`keep`). Rejects with a `StoryFileError`.
 */
export function fetchStory(
  game: { tuid: string; file: StoryFile },
  kind: EngineKind,
  store: Store,
  options: FetchOptions = {},
): { promise: Promise<StoryData>; abort(): void } {
  const url = game.file.url;
  const defer = options.defer || ((write: () => void) => setTimeout(write, CACHE_DELAY_MS));
  const keep = options.keep;
  const cached = readCachedStory(store, game.tuid, url);
  if (cached) {
    if (keep) defer(() => void keep(cached).catch(() => undefined));
    return { promise: Promise.resolve(cached), abort: () => undefined };
  }

  const loading = download(url, options);
  return {
    promise: loading.promise.then((story) => {
      const data = storyData(game.file, kind, story);
      if (!looksLikeStory(kind, data.bytes))
        throw storyFileError('format', 'Not a story file: ' + url);
      const write = () => cacheFile(store, game.tuid, url, data.bytes, data.files);
      defer(() => {
        if (!keep) write();
        else keep(data).then((kept) => kept || write(), write);
      });
      return data;
    }),
    abort: loading.abort,
  };
}
