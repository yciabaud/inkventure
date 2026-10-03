import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import { cacheFile } from './files';
import { AUTO_KEEP_BUDGET, getKept, isKept, keptSize } from './kept';
import {
  appBase,
  cacheFiles,
  clearKeptCache,
  keep,
  KEPT_CACHE,
  keptFiles,
  keptIndexUrl,
  keptKinds,
  keptStorySize,
  keptUrl,
  localFiles,
  MAX_LOCAL_KEPT_BYTES,
  readKeptGame,
  readKeptStory,
  unkeep,
  type KeepInfo,
} from './keptFiles';
import { keys, PREFIX } from './keys';
import { createStore, isStorageFullError } from './store';

const BASE = 'https://example.org/app/';
const URL_A = 'https://ifarchive.org/if-archive/games/zcode/a.z5';
const URL_B = 'https://ifarchive.org/if-archive/games/zcode/b.z5';

/** The part of the Cache API the store uses, in memory; `quota` (bytes of bodies) simulates a full cache. */
class FakeCaches {
  stores: Record<string, Map<string, Uint8Array>> = {};
  constructor(private readonly quota = Infinity) {}
  private used(): number {
    let total = 0;
    for (const name of Object.keys(this.stores)) {
      this.stores[name].forEach((body) => (total += body.length));
    }
    return total;
  }
  open(name: string) {
    const entries = this.stores[name] || (this.stores[name] = new Map());
    const cache = {
      put: async (url: string, response: Response) => {
        const body = new Uint8Array(await response.arrayBuffer());
        const before = entries.has(url) ? entries.get(url)!.length : 0;
        if (this.used() - before + body.length > this.quota) {
          const error = new Error('Quota exceeded');
          error.name = 'QuotaExceededError';
          throw error;
        }
        entries.set(url, body);
      },
      match: async (url: string) =>
        entries.has(url) ? new Response(entries.get(url)!.slice()) : undefined,
      delete: async (url: string) => entries.delete(url),
    };
    return Promise.resolve(cache);
  }
  delete(name: string) {
    const found = !!this.stores[name];
    delete this.stores[name];
    return Promise.resolve(found);
  }
  get asCacheStorage(): CacheStorage {
    return this as unknown as CacheStorage;
  }
}

function story(size: number, fill = 7): Uint8Array {
  return new Uint8Array(size).fill(fill);
}

function info(url = URL_A, kind = 'zmachine'): KeepInfo {
  return {
    url: url,
    kind: kind,
    title: 'Game A',
    author: 'Ann',
    game: { tuid: 'ga', title: 'Game A', file: { url: url } },
  };
}

function setup(quota = Infinity, cacheQuota = Infinity) {
  const backend = new MemoryBackend(quota);
  const store = createStore(backend);
  const caches = new FakeCaches(cacheQuota);
  const files = cacheFiles(caches.asCacheStorage, BASE);
  return { backend, store, caches, files };
}

describe('where kept files go', () => {
  it('uses the Cache API when there is one, else localStorage', () => {
    const { store, caches } = setup();
    expect(keptFiles(store, { caches: caches.asCacheStorage, base: BASE }).where).toBe('cache');
    expect(keptFiles(store, {}).where).toBe('local');
  });

  it('keeps only small stories in localStorage, any story in the Cache API', () => {
    const { store, files } = setup();
    expect(files.fits(50 * 1024 * 1024)).toBe(true);
    const local = localFiles(store);
    expect(local.fits(MAX_LOCAL_KEPT_BYTES - 1)).toBe(true);
    expect(local.fits(MAX_LOCAL_KEPT_BYTES)).toBe(false);
    expect(local.fits(0)).toBe(false);
  });

  it('names the files under the app folder', () => {
    expect(appBase('https://example.org/app/index.html?perf=1#/play/x')).toBe(BASE);
    expect(appBase('https://example.org/app/#/home')).toBe(BASE);
    expect(keptUrl(BASE, 'ga-fr', 'story')).toBe(BASE + 'kept/ga-fr/story');
    expect(keptIndexUrl(BASE)).toBe(BASE + 'kept/index.json');
  });
});

describe('keeping an adventure (pin)', () => {
  it('stores the story and the page data, and lists it with its size', async () => {
    const { store, caches, files } = setup();
    const bytes = story(3000);
    const entry = await keep(store, files, 'ga', info(), { bytes: bytes }, 1000);
    const game = JSON.stringify(info().game);
    expect(entry).toEqual({
      url: URL_A,
      kind: 'zmachine',
      title: 'Game A',
      author: 'Ann',
      size: 3000 + game.length,
      date: 1000,
      where: 'cache',
    });
    expect(getKept(store)).toEqual({ ga: entry });
    expect(isKept(store, 'ga')).toBe(true);
    expect(caches.stores[KEPT_CACHE].get(keptUrl(BASE, 'ga', 'story'))).toEqual(bytes);
    expect(await readKeptStory(store, files, 'ga', URL_A)).toEqual({ bytes: bytes });
    expect(await readKeptGame(store, files, 'ga')).toEqual(info().game);
  });

  it('tells the Service Worker which engines the kept adventures need', async () => {
    const { store, caches, files } = setup();
    await keep(store, files, 'ga', info(URL_A, 'zmachine'), { bytes: story(10) }, 1);
    await keep(store, files, 'gb', info(URL_B, 'glulx'), { bytes: story(10) }, 2);
    await keep(store, files, 'gc', info(URL_B, 'zmachine'), { bytes: story(10) }, 3);
    expect(keptKinds(getKept(store))).toEqual(['glulx', 'zmachine']);
    const index = caches.stores[KEPT_CACHE].get(keptIndexUrl(BASE))!;
    expect(JSON.parse(new TextDecoder().decode(index))).toEqual({ kinds: ['glulx', 'zmachine'] });
  });

  it('keeps a Twine story with its files', async () => {
    const { store, files } = setup();
    const data = { bytes: story(500, 1), files: { 'img/a.png': story(40, 2) } };
    const entry = await keep(store, files, 'tw', info(URL_A, 'twine'), data, 1);
    expect(entry.files).toBe(1);
    expect(entry.size).toBe(keptStorySize(data) + JSON.stringify(info().game).length);
    expect(await readKeptStory(store, files, 'tw', URL_A)).toEqual(data);
  });

  it('drops its copy in the story file cache (the same file twice)', async () => {
    const { store, files } = setup();
    expect(cacheFile(store, 'ga', URL_A, story(100))).toBe(true);
    await keep(store, files, 'ga', info(), { bytes: story(100) }, 1);
    expect(store.keys()).not.toContain(keys.file('ga'));
  });

  it('reads nothing for another version, or when its files are gone', async () => {
    const { store, caches, files } = setup();
    await keep(store, files, 'ga', info(), { bytes: story(100) }, 1);
    expect(await readKeptStory(store, files, 'ga', URL_B)).toBeNull();
    expect(await readKeptStory(store, files, 'nope', URL_A)).toBeNull();
    // The browser may drop the cache (persist() is refused on the Kindle): the game is still listed.
    delete caches.stores[KEPT_CACHE];
    expect(await readKeptStory(store, files, 'ga', URL_A)).toBeNull();
    expect(await readKeptGame(store, files, 'ga')).toBeNull();
    expect(isKept(store, 'ga')).toBe(true);
  });

  it('leaves nothing behind when the cache is full', async () => {
    const { store, caches, files } = setup(Infinity, 1000);
    await expect(keep(store, files, 'ga', info(), { bytes: story(5000) }, 1)).rejects.toThrow();
    expect(getKept(store)).toEqual({});
    expect(caches.stores[KEPT_CACHE].size).toBe(0);
  });

  it('removes its files when localStorage cannot list it', async () => {
    const { store, caches, files } = setup(50);
    const error = await keep(store, files, 'ga', info(), { bytes: story(100) }, 1).catch(
      (e: unknown) => e,
    );
    expect(isStorageFullError(error)).toBe(true);
    expect(caches.stores[KEPT_CACHE].size).toBe(0);
  });
});

describe('removing an adventure from the device (unpin)', () => {
  it('frees its files and forgets it; its saves stay', async () => {
    const { store, caches, files } = setup();
    store.set(keys.autosave('ga'), { v: 1 });
    await keep(store, files, 'ga', info(URL_A, 'zmachine'), { bytes: story(100) }, 1);
    await keep(store, files, 'gb', info(URL_B, 'glulx'), { bytes: story(200) }, 2);
    await unkeep(store, files, 'ga');
    expect(Object.keys(getKept(store))).toEqual(['gb']);
    expect(caches.stores[KEPT_CACHE].has(keptUrl(BASE, 'ga', 'story'))).toBe(false);
    expect(caches.stores[KEPT_CACHE].has(keptUrl(BASE, 'gb', 'story'))).toBe(true);
    expect(store.keys()).toContain(keys.autosave('ga'));
    const index = caches.stores[KEPT_CACHE].get(keptIndexUrl(BASE))!;
    expect(JSON.parse(new TextDecoder().decode(index))).toEqual({ kinds: ['glulx'] });

    await unkeep(store, files, 'gb');
    expect(store.keys()).not.toContain(keys.kept);
  });

  it('Reset all data removes the whole kept cache', async () => {
    const { store, caches, files } = setup();
    await keep(store, files, 'ga', info(), { bytes: story(100) }, 1);
    await clearKeptCache({ caches: caches.asCacheStorage });
    expect(caches.stores[KEPT_CACHE]).toBeUndefined();
  });
});

describe('sizes', () => {
  it('adds up the kept adventures, counted by the app', async () => {
    const { store, files } = setup();
    const a = await keep(store, files, 'ga', info(), { bytes: story(1000) }, 1);
    const b = await keep(store, files, 'gb', info(URL_B), { bytes: story(2500) }, 2);
    expect(keptSize(getKept(store))).toBe(a.size + b.size);
    expect(AUTO_KEEP_BUDGET).toBe(40 * 1024 * 1024);
  });

  it('counts the localStorage copies in Settings › Data', async () => {
    const { store } = setup();
    await keep(store, localFiles(store), 'ga', info(), { bytes: story(1000) }, 1);
    const usage = store.usage();
    expect(usage.kept.count).toBe(1);
    expect(usage.files.count).toBe(0);
  });
});

describe('localStorage fallback', () => {
  it('round-trips a small story, deflated, and refuses a large one', async () => {
    const { backend, store } = setup();
    const local = localFiles(store);
    const bytes = story(20000);
    const entry = await keep(store, local, 'ga', info(), { bytes: bytes }, 1);
    expect(entry.where).toBe('local');
    expect(backend.getItem(PREFIX + keys.keptFile('ga'))!.length).toBeLessThan(1000);
    expect(await readKeptStory(store, local, 'ga', URL_A)).toEqual({ bytes: bytes });
    await expect(
      keep(store, local, 'big', info(), { bytes: story(MAX_LOCAL_KEPT_BYTES) }, 1),
    ).rejects.toThrow();
    expect(isKept(store, 'big')).toBe(false);
  });

  it('a kept file is pinned: the LRU evicts cached files, never it', async () => {
    const noise = (size: number, seed: number) => {
      const bytes = new Uint8Array(size);
      let x = seed;
      for (let i = 0; i < size; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        bytes[i] = x >> 16;
      }
      return bytes;
    };
    const { store } = setup(50000);
    const local = localFiles(store);
    await keep(store, local, 'pinned', info(), { bytes: noise(15000, 1) }, 1);
    expect(cacheFile(store, 'c1', URL_A, noise(15000, 2))).toBe(true);
    // A third file needs room: the cached one goes, the kept one stays.
    expect(cacheFile(store, 'c2', URL_B, noise(15000, 3))).toBe(true);
    expect(store.keys()).not.toContain(keys.file('c1'));
    expect(store.keys()).toContain(keys.keptFile('pinned'));
    // A save that does not fit with it fails rather than evict it.
    expect(() => store.set(keys.save('g', '1'), 'x'.repeat(40000))).toThrow();
    expect(store.keys()).toContain(keys.keptFile('pinned'));
    expect(await readKeptStory(store, local, 'pinned', URL_A)).toEqual({ bytes: noise(15000, 1) });
  });
});
