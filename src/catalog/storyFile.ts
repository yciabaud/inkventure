// Story files (SPEC §5.5; story S3.4): downloaded at play time from the URL in `games/<tuid>.json` (the IF Archive
// sends CORS headers, verified on a Kindle in S0.3), unzipped when the catalogue says so, and kept in storage when
// small (src/storage/files.ts).
import { unzipSync } from 'fflate';
import type { StoryFile } from '../../scripts/catalog/resolver';
import type { EngineKind } from '../engines/engine';
import { looksLikeStory } from '../engines/formats';
import { cacheFile, readCachedFile } from '../storage/files';
import type { Store } from '../storage/store';
import { storyFileError, type StoryFileError } from './storyFileError';

export { isStoryFileError, storyFileError, type StoryFileError } from './storyFileError';

export type { StoryFile };

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

/** The story itself from the downloaded bytes: unzipped when the catalogue says the file is a zip. */
export function storyBytes(file: StoryFile, bytes: Uint8Array): Uint8Array {
  return file.archive && file.archive.type === 'zip'
    ? extractPrimary(bytes, file.archive.primary)
    : bytes;
}

interface FetchOptions extends DownloadOptions {
  /** Runs the cache write; by default a little later, so it does not delay the start of the game. */
  defer?: (write: () => void) => void;
}

/** Delay before a downloaded file is written to the cache (deflating it is slow on an e-reader). */
const CACHE_DELAY_MS = 2000;

/**
 * The story of a catalogue game: from the cache when it holds this file, else downloaded (and unzipped), checked
 * against the engine's format and cached when small. Rejects with a `StoryFileError`.
 */
export function fetchStory(
  game: { tuid: string; file: StoryFile },
  kind: EngineKind,
  store: Store,
  options: FetchOptions = {},
): Download {
  const url = game.file.url;
  const cached = readCachedFile(store, game.tuid, url);
  if (cached) return { promise: Promise.resolve(cached), abort: () => undefined };

  const defer = options.defer || ((write: () => void) => setTimeout(write, CACHE_DELAY_MS));
  const loading = download(url, options);
  return {
    promise: loading.promise.then((bytes) => {
      const story = storyBytes(game.file, bytes);
      if (!looksLikeStory(kind, story)) throw storyFileError('format', 'Not a story file: ' + url);
      defer(() => cacheFile(store, game.tuid, url, story));
      return story;
    }),
    abort: loading.abort,
  };
}
