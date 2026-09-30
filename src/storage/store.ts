import { isQuotaError, type KeyValueBackend } from './backend';
import { autosaveTuid, isEvictable, isFileKey, keys, PREFIX } from './keys';
import { computeUsage, isAppKey, type StorageUsage } from './usage';

/** Autosaves of games not played for this long may be evicted when the storage is full. */
export const STALE_AUTOSAVE_MS = 90 * 24 * 60 * 60 * 1000;

export interface StorageFullError extends Error {
  name: 'StorageFullError';
  key: string;
}

// A plain Error rather than a subclass: extending built-ins pulls heavy helpers into the legacy bundle.
function storageFullError(key: string): StorageFullError {
  const error = new Error('Storage full while writing ' + key) as StorageFullError;
  error.name = 'StorageFullError';
  error.key = key;
  return error;
}

/** Thrown by `set` when no evictable entry is left; the UI should send the user to "manage data". */
export function isStorageFullError(error: unknown): error is StorageFullError {
  return error instanceof Error && error.name === 'StorageFullError';
}

export type StorageEvent =
  | { type: 'full'; key: string }
  | { type: 'evicted'; key: string; reason: 'lru-file' | 'stale-autosave' };

export interface Store {
  /** False when running on the in-memory fallback: nothing survives a reload. */
  readonly persistent: boolean;
  /** Parsed value, or undefined when missing or unreadable. Reading a file or autosave marks it as used. */
  get<T>(key: string): T | undefined;
  /**
   * Serialises to JSON; evicts per SPEC §6.1 when full. Throws a `StorageFullError` when nothing can be evicted.
   * With `cache`, the entry is optional (a cached story file): only other cached files are evicted for it, and failing
   * to store it raises no `full` event.
   */
  set(key: string, value: unknown, options?: SetOptions): void;
  remove(key: string): void;
  /** All keys of this schema version, without the prefix. */
  keys(): string[];
  subscribe(listener: (event: StorageEvent) => void): () => void;
  /** Space used by the app's entries (SPEC §6.1), for Settings. */
  usage(): StorageUsage;
  /** Removes every `ik:` entry (all schema versions and the schema key) and nothing else: back to a first launch. */
  clearAll(): void;
}

export interface SetOptions {
  cache?: boolean;
}

interface Options {
  persistent?: boolean;
  now?: () => number;
}

interface Progress {
  lastPlayed?: number;
}

export function createStore(backend: KeyValueBackend, options: Options = {}): Store {
  const now = options.now || Date.now;
  const listeners: Array<(event: StorageEvent) => void> = [];

  function emit(event: StorageEvent) {
    const current = listeners.slice();
    for (let i = 0; i < current.length; i++) current[i](event);
  }

  function read<T>(key: string): T | undefined {
    const raw = backend.getItem(PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  function allKeys(): string[] {
    const result: string[] = [];
    for (let i = 0; i < backend.length; i++) {
      const key = backend.key(i);
      if (key !== null && key.indexOf(PREFIX) === 0) result.push(key.slice(PREFIX.length));
    }
    return result;
  }

  // Access order, oldest first. Advisory: losing it only makes eviction order less accurate.
  function readLru(): string[] {
    const lru = read<string[]>(keys.lru);
    return Array.isArray(lru) ? lru : [];
  }

  function writeLru(lru: string[]) {
    try {
      backend.setItem(PREFIX + keys.lru, JSON.stringify(lru));
    } catch {
      // Ignored: the LRU list must never make a write fail.
    }
  }

  function updateLru(key: string, used: boolean) {
    const lru = readLru();
    const index = lru.indexOf(key);
    if (index === -1 && !used) return;
    if (index !== -1) lru.splice(index, 1);
    if (used) lru.push(key);
    writeLru(lru);
  }

  /** Next entry to evict (never `protect`): LRU cached files first, then the oldest stale autosave. */
  function nextVictim(protect: string, filesOnly: boolean): StorageEvent | undefined {
    const all = allKeys();
    const lru = readLru();
    const files = all.filter((key) => isFileKey(key) && key !== protect);
    if (files.length > 0) {
      // Files missing from the LRU list were never touched through the store: evict them first.
      files.sort((a, b) => lru.indexOf(a) - lru.indexOf(b));
      return { type: 'evicted', key: files[0], reason: 'lru-file' };
    }
    if (filesOnly) return undefined;
    const threshold = now() - STALE_AUTOSAVE_MS;
    let victim: string | undefined;
    let oldest = Infinity;
    for (let i = 0; i < all.length; i++) {
      const key = all[i];
      const tuid = autosaveTuid(key);
      if (tuid === undefined || key === protect) continue;
      const progress = read<Progress>(keys.progress(tuid));
      const lastPlayed =
        progress && typeof progress.lastPlayed === 'number' ? progress.lastPlayed : NaN;
      // Unknown last-played date: keep the autosave rather than guess.
      if (lastPlayed < threshold && lastPlayed < oldest) {
        oldest = lastPlayed;
        victim = key;
      }
    }
    return victim === undefined
      ? undefined
      : { type: 'evicted', key: victim, reason: 'stale-autosave' };
  }

  return {
    persistent: options.persistent !== false,

    get<T>(key: string): T | undefined {
      const value = read<T>(key);
      if (value !== undefined && isEvictable(key)) updateLru(key, true);
      return value;
    },

    set(key: string, value: unknown, setOptions?: SetOptions) {
      const cache = !!(setOptions && setOptions.cache);
      const raw = JSON.stringify(value);
      for (;;) {
        try {
          backend.setItem(PREFIX + key, raw);
          break;
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          const victim = nextVictim(key, cache);
          if (!victim) {
            if (!cache) emit({ type: 'full', key });
            throw storageFullError(key);
          }
          backend.removeItem(PREFIX + victim.key);
          updateLru(victim.key, false);
          emit(victim);
        }
      }
      if (isEvictable(key)) updateLru(key, true);
    },

    remove(key: string) {
      backend.removeItem(PREFIX + key);
      if (isEvictable(key)) updateLru(key, false);
    },

    keys: allKeys,

    usage() {
      const entries: Array<{ key: string; length: number }> = [];
      for (let i = 0; i < backend.length; i++) {
        const key = backend.key(i);
        const value = key === null ? null : backend.getItem(key);
        if (key !== null && value !== null) entries.push({ key: key, length: value.length });
      }
      return computeUsage(entries);
    },

    clearAll() {
      // Collected first: removing while walking the indices would skip entries.
      const doomed: string[] = [];
      for (let i = 0; i < backend.length; i++) {
        const key = backend.key(i);
        if (key !== null && isAppKey(key)) doomed.push(key);
      }
      for (let i = 0; i < doomed.length; i++) backend.removeItem(doomed[i]);
    },

    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
  };
}
