// Cached story files (SPEC §5.5, §6.1; story S3.4): small files only, under `file:<tuid>`, so a game played again
// starts without the network. Evicted first (least recently used) when storage runs short; a file never evicts saves.
// Imported directly (not from index.ts): it pulls in the deflate library, which stays out of the initial bundle.
// A Twine story from a zip is kept with the files it uses (story S1.11), packed together in one stored zip.
import { unzipSync, zipSync } from 'fflate';
import { compressBytes, decompressBytes } from './compress';
import { keys } from './keys';
import type { Store } from './store';

/** Only story files smaller than this are kept (SPEC §5.5); larger ones are downloaded again in each session. */
export const MAX_CACHED_FILE_BYTES = 512 * 1024;

/** Stored form: the file's catalogue URL (a new URL means a new version) and its bytes, deflated + base64. */
interface FileRecord {
  v: 1;
  url: string;
  data: string;
  /** Set when `data` is a zip of the story (`story`) and its files (`f/<path>`). */
  files?: 1;
}

/** Files a story uses (pictures, fonts, styles, scripts), by path relative to the story's folder. */
export type StoryFiles = Record<string, Uint8Array>;

/** A story file, with the files it uses when it came from a zip that has them. */
export interface StoryData {
  bytes: Uint8Array;
  files?: StoryFiles;
}

const STORY_ENTRY = 'story';
const FILE_PREFIX = 'f/';

/** The story as one block of bytes: itself, or a zip of it and its files. */
export function pack(story: StoryData): Uint8Array {
  if (!story.files || !Object.keys(story.files).length) return story.bytes;
  const entries: Record<string, Uint8Array> = {};
  entries[STORY_ENTRY] = story.bytes;
  for (const path of Object.keys(story.files)) entries[FILE_PREFIX + path] = story.files[path];
  // Stored, not deflated: the record is deflated as a whole.
  return zipSync(entries, { level: 0 });
}

/** The story (and its files) from `pack`'s zip. */
export function unpack(bytes: Uint8Array): StoryData {
  const entries = unzipSync(bytes);
  const files: StoryFiles = {};
  for (const name of Object.keys(entries)) {
    if (name.indexOf(FILE_PREFIX) === 0) files[name.slice(FILE_PREFIX.length)] = entries[name];
  }
  if (!entries[STORY_ENTRY]) throw new Error('No story in the cached zip');
  return { bytes: entries[STORY_ENTRY], files: files };
}

export function shouldCache(size: number): boolean {
  return size > 0 && size < MAX_CACHED_FILE_BYTES;
}

/** The cached story of `tuid` (and its files) if it came from `url`; a stale or unreadable entry is dropped. Marks it
 * as used. */
export function readCachedStory(store: Store, tuid: string, url: string): StoryData | null {
  const key = keys.file(tuid);
  const record = store.get<FileRecord>(key);
  if (!record) return null;
  if (record.v === 1 && record.url === url && typeof record.data === 'string') {
    try {
      const bytes = decompressBytes(record.data);
      return record.files ? unpack(bytes) : { bytes: bytes };
    } catch {
      // Unreadable: dropped below.
    }
  }
  store.remove(key);
  return null;
}

/** The cached story file of `tuid` alone, if it came from `url` (see readCachedStory). */
export function readCachedFile(store: Store, tuid: string, url: string): Uint8Array | null {
  const story = readCachedStory(store, tuid, url);
  return story ? story.bytes : null;
}

/**
 * Keeps the story of `tuid` (with its files) if it is small enough, all together. Optional: when storage is short it
 * only evicts other cached files, and says false when there is no room.
 */
export function cacheFile(
  store: Store,
  tuid: string,
  url: string,
  bytes: Uint8Array,
  files?: StoryFiles,
): boolean {
  const packed = pack({ bytes: bytes, files: files });
  if (!shouldCache(packed.length)) return false;
  const record: FileRecord = { v: 1, url: url, data: compressBytes(packed) };
  if (packed !== bytes) record.files = 1;
  try {
    store.set(keys.file(tuid), record, { cache: true });
    return true;
  } catch {
    return false;
  }
}
