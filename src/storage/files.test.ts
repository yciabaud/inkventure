import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import {
  cacheFile,
  MAX_CACHED_FILE_BYTES,
  readCachedFile,
  readCachedStory,
  shouldCache,
} from './files';
import { keys, PREFIX } from './keys';
import { createStore, type StorageEvent } from './store';

const URL_A = 'https://ifarchive.org/if-archive/games/zcode/a.z5';

/** Incompressible bytes, so the stored size follows the file size. */
function noise(size: number, seed = 1): Uint8Array {
  const bytes = new Uint8Array(size);
  let x = seed;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    bytes[i] = x >> 16;
  }
  return bytes;
}

function setup(quota = Infinity) {
  const backend = new MemoryBackend(quota);
  const store = createStore(backend);
  const events: StorageEvent[] = [];
  store.subscribe((e) => events.push(e));
  return { backend, store, events };
}

describe('story file cache policy', () => {
  it('keeps only files under 512 KB', () => {
    expect(shouldCache(0)).toBe(false);
    expect(shouldCache(1)).toBe(true);
    expect(shouldCache(MAX_CACHED_FILE_BYTES - 1)).toBe(true);
    expect(shouldCache(MAX_CACHED_FILE_BYTES)).toBe(false);

    const { store } = setup();
    expect(cacheFile(store, 'big', URL_A, new Uint8Array(MAX_CACHED_FILE_BYTES))).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  it('round-trips a file, deflated, and marks it as used', () => {
    const { backend, store } = setup();
    const story = new Uint8Array(20000).fill(7);
    expect(cacheFile(store, 'g1', URL_A, story)).toBe(true);
    expect(backend.getItem(PREFIX + keys.file('g1'))!.length).toBeLessThan(1000);
    expect(readCachedFile(store, 'g1', URL_A)).toEqual(story);
    expect(store.get<string[]>(keys.lru)).toEqual([keys.file('g1')]);
  });

  it('round-trips a story with its files (S1.11), and counts them in the size limit', () => {
    const { store } = setup();
    const story = new Uint8Array(3000).fill(1);
    const files = { 'img/a.png': noise(200, 2), 'fonts/My Font.woff2': noise(300, 3) };
    expect(cacheFile(store, 'g1', URL_A, story, files)).toBe(true);
    expect(readCachedStory(store, 'g1', URL_A)).toEqual({ bytes: story, files: files });
    expect(readCachedFile(store, 'g1', URL_A)).toEqual(story);
    // A file cached without files reads back without them.
    cacheFile(store, 'g2', URL_A, story);
    expect(readCachedStory(store, 'g2', URL_A)).toEqual({ bytes: story });
    // Small story, large files: not kept.
    const large = { 'img/big.png': noise(MAX_CACHED_FILE_BYTES) };
    expect(cacheFile(store, 'g3', URL_A, story, large)).toBe(false);
    expect(store.keys()).not.toContain(keys.file('g3'));
  });

  it('drops a file cached from another URL (a new version) or unreadable', () => {
    const { backend, store } = setup();
    cacheFile(store, 'g1', URL_A, noise(100));
    expect(readCachedFile(store, 'g1', URL_A.replace('a.z5', 'a2.z5'))).toBeNull();
    expect(store.keys()).not.toContain(keys.file('g1'));

    backend.setItem(PREFIX + keys.file('g2'), JSON.stringify({ v: 1, url: URL_A, data: '!!' }));
    expect(readCachedFile(store, 'g2', URL_A)).toBeNull();
    expect(store.keys()).not.toContain(keys.file('g2'));
    expect(readCachedFile(store, 'none', URL_A)).toBeNull();
  });

  it('evicts the least recently used file to make room', () => {
    // Room for two files of this size, not three.
    const { store, events } = setup(2 * 14000 + 2000);
    expect(cacheFile(store, 'g1', URL_A, noise(10000, 1))).toBe(true);
    expect(cacheFile(store, 'g2', URL_A, noise(10000, 2))).toBe(true);
    expect(readCachedFile(store, 'g1', URL_A)).not.toBeNull(); // g2 is now the least recently used
    expect(cacheFile(store, 'g3', URL_A, noise(10000, 3))).toBe(true);
    expect(events).toEqual([{ type: 'evicted', key: keys.file('g2'), reason: 'lru-file' }]);
    expect(readCachedFile(store, 'g1', URL_A)).not.toBeNull();
    expect(readCachedFile(store, 'g3', URL_A)).not.toBeNull();
  });

  it('never evicts saves for a file, nor reports storage full', () => {
    const { store, events } = setup(16000);
    // An autosave of a game not played for years: evictable, but not for a cached file.
    store.set(keys.progress('old'), { lastPlayed: 0 });
    store.set(keys.autosave('old'), { data: 'x'.repeat(8000) });
    expect(cacheFile(store, 'g1', URL_A, noise(10000))).toBe(false);
    expect(store.keys()).toContain(keys.autosave('old'));
    expect(events).toEqual([]);
  });
});
