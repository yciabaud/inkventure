// Cached story files (SPEC §5.5, §6.1; story S3.4): small files only, under `file:<tuid>`, so a game played again
// starts without the network. Evicted first (least recently used) when storage runs short; a file never evicts saves.
// Imported directly (not from index.ts): it pulls in the deflate library, which stays out of the initial bundle.
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
}

export function shouldCache(size: number): boolean {
  return size > 0 && size < MAX_CACHED_FILE_BYTES;
}

/** The cached story of `tuid` if it came from `url`; a stale or unreadable entry is dropped. Marks it as used. */
export function readCachedFile(store: Store, tuid: string, url: string): Uint8Array | null {
  const key = keys.file(tuid);
  const record = store.get<FileRecord>(key);
  if (!record) return null;
  if (record.v === 1 && record.url === url && typeof record.data === 'string') {
    try {
      return decompressBytes(record.data);
    } catch {
      // Unreadable: dropped below.
    }
  }
  store.remove(key);
  return null;
}

/**
 * Keeps the story of `tuid` if it is small enough. Optional: when storage is short it only evicts other cached files,
 * and says false when there is no room.
 */
export function cacheFile(store: Store, tuid: string, url: string, bytes: Uint8Array): boolean {
  if (!shouldCache(bytes.length)) return false;
  const record: FileRecord = { v: 1, url: url, data: compressBytes(bytes) };
  try {
    store.set(keys.file(tuid), record, { cache: true });
    return true;
  } catch {
    return false;
  }
}
