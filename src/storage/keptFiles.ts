// The files of adventures kept offline (SPEC §6.2; story S5.3): the story file (with a Twine story's own files) and the
// game's page data (`games/<tuid>.json`), pinned: never evicted, unlike the story file cache of S3.4 (files.ts).
// Stored in the Cache API, which the Kindle keeps across browser and device restarts (S0.9) and the Service Worker can
// read; in localStorage, deflated, for small files on a browser without it. Imported lazily (it pulls in the deflate
// library).
import { compressBytes, decompressBytes } from './compress';
import { MAX_CACHED_FILE_BYTES, pack, unpack, type StoryData } from './files';
import { getKept, type KeptEntry, type KeptList, type KeptWhere } from './kept';
import { keys } from './keys';
import type { Store } from './store';

/** The Cache API cache of kept files. Not versioned: a new build of the app keeps it. Read by the Service Worker. */
export const KEPT_CACHE = 'inkventure-kept';

/** Path of the kept files, relative to the app's folder (the Service Worker's scope). */
export const KEPT_PATH = 'kept/';

/** In localStorage (no Cache API), only stories smaller than this are kept, like the story file cache. */
export const MAX_LOCAL_KEPT_BYTES = MAX_CACHED_FILE_BYTES;

/** A kept adventure's files, as stored. */
interface Parts {
  /** The story (`pack`ed with its files). */
  story: Uint8Array;
  /** The game's page data, as JSON. */
  game: string;
}

/** The engines of the kept adventures, each once, sorted. */
export function keptKinds(list: KeptList): string[] {
  const kinds: string[] = [];
  for (const id of Object.keys(list)) {
    if (kinds.indexOf(list[id].kind) < 0) kinds.push(list[id].kind);
  }
  return kinds.sort();
}

/** Records a kept adventure. Throws a `StorageFullError` when localStorage is full (the caller undoes the files). */
export function setKept(store: Store, id: string, entry: KeptEntry): void {
  const list = getKept(store);
  list[id] = entry;
  store.set(keys.kept, list);
}

/** Forgets a kept adventure (its files are removed first). */
export function dropKept(store: Store, id: string): void {
  const list = getKept(store);
  if (!list[id]) return;
  delete list[id];
  if (Object.keys(list).length) store.set(keys.kept, list);
  else store.remove(keys.kept);
}

/** Where kept files go: the Cache API, else localStorage. */
export interface KeptFiles {
  where: KeptWhere;
  /** Whether a story of `size` bytes can be kept here. */
  fits(size: number): boolean;
  /** Stores both parts, or neither. */
  write(id: string, parts: Parts): Promise<void>;
  readStory(id: string): Promise<Uint8Array | null>;
  readGame(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
  /** Tells the Service Worker which engines the kept adventures need (Cache API only). */
  setKinds(kinds: string[]): Promise<void>;
}

/** URL of a kept file, under the app's folder `base` (ends with `/`). */
export function keptUrl(base: string, id: string, part: 'story' | 'game.json'): string {
  return base + KEPT_PATH + encodeURIComponent(id) + '/' + part;
}

/** The list of engines the Service Worker reads when it installs. */
export function keptIndexUrl(base: string): string {
  return base + KEPT_PATH + 'index.json';
}

/** The app's folder, from the page address. */
export function appBase(href: string): string {
  return href
    .split('#')[0]
    .split('?')[0]
    .replace(/[^/]*$/, '');
}

export function cacheFiles(storage: CacheStorage, base: string): KeptFiles {
  const open = () => storage.open(KEPT_CACHE);
  const read = (url: string) =>
    open()
      .then((cache) => cache.match(url))
      .then((response) => response || null);
  const remove = (id: string) =>
    open().then((cache) =>
      Promise.all([
        cache.delete(keptUrl(base, id, 'story')),
        cache.delete(keptUrl(base, id, 'game.json')),
      ]).then(() => undefined),
    );
  return {
    where: 'cache',
    fits: (size) => size > 0,
    write(id, parts) {
      return open()
        .then((cache) =>
          cache
            .put(
              keptUrl(base, id, 'story'),
              new Response(parts.story as Uint8Array<ArrayBuffer>, {
                headers: { 'Content-Type': 'application/octet-stream' },
              }),
            )
            .then(() =>
              cache.put(
                keptUrl(base, id, 'game.json'),
                new Response(parts.game, { headers: { 'Content-Type': 'application/json' } }),
              ),
            ),
        )
        .then(
          () => undefined,
          (error: unknown) =>
            remove(id).then(
              () => Promise.reject(error),
              () => Promise.reject(error),
            ),
        );
    },
    readStory: (id) =>
      read(keptUrl(base, id, 'story')).then((response) =>
        response ? response.arrayBuffer().then((buffer) => new Uint8Array(buffer)) : null,
      ),
    readGame: (id) =>
      read(keptUrl(base, id, 'game.json')).then((response) => (response ? response.text() : null)),
    remove: remove,
    setKinds: (kinds) =>
      open().then((cache) =>
        cache.put(
          keptIndexUrl(base),
          new Response(JSON.stringify({ kinds: kinds }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
  };
}

/** Stored form under `kept:<id>` in localStorage. */
interface LocalRecord {
  v: 1;
  /** The packed story, deflated + base64. */
  story: string;
  game: string;
}

export function localFiles(store: Store): KeptFiles {
  const record = (id: string) => {
    const value = store.get<LocalRecord>(keys.keptFile(id));
    return value && value.v === 1 && typeof value.story === 'string' ? value : null;
  };
  return {
    where: 'local',
    fits: (size) => size > 0 && size < MAX_LOCAL_KEPT_BYTES,
    write(id, parts) {
      return new Promise<void>((resolve) => {
        // Not a cache entry: it never evicts saves, but it is never evicted either.
        const value: LocalRecord = { v: 1, story: compressBytes(parts.story), game: parts.game };
        store.set(keys.keptFile(id), value);
        resolve();
      });
    },
    readStory(id) {
      return new Promise<Uint8Array | null>((resolve) => {
        const value = record(id);
        resolve(value ? decompressBytes(value.story) : null);
      });
    },
    readGame(id) {
      const value = record(id);
      return Promise.resolve(value ? value.game : null);
    },
    remove(id) {
      store.remove(keys.keptFile(id));
      return Promise.resolve();
    },
    setKinds: () => Promise.resolve(),
  };
}

interface Env {
  caches?: CacheStorage;
  base?: string;
}

function defaultEnv(): Env {
  if (typeof window === 'undefined') return {};
  let storage: CacheStorage | undefined;
  try {
    storage = window.caches;
  } catch {
    // Some browsers throw on `caches` outside a secure context.
  }
  return { caches: storage, base: appBase(window.location.href) };
}

/**
 * Where kept files go, in order: the Cache API (the Kindle's, measured in S0.9), else localStorage for small files.
 * IndexedDB, also measured there, is not used: every browser with a Service Worker has the Cache API.
 */
export function keptFiles(store: Store, env: Env = defaultEnv()): KeptFiles {
  if (env.caches && typeof env.caches.open === 'function' && typeof Response !== 'undefined') {
    return cacheFiles(env.caches, env.base || '');
  }
  return localFiles(store);
}

/** What `keep` needs to know about the game. */
export interface KeepInfo {
  url: string;
  kind: string;
  title: string;
  author: string;
  /** The game's page data (`games/<tuid>.json`), so its page and its file open without Wi-Fi. */
  game: unknown;
  /** Kept when the game was started. */
  auto?: boolean;
}

/** Bytes a story would take once kept (the story with its files, packed). */
export function keptStorySize(story: StoryData): number {
  return pack(story).length;
}

/**
 * Keeps an adventure: its story (with its files) and its page data, pinned. A kept game's copy in the story file
 * cache is dropped (it would be the same file twice). Rejects when there is no room (`fits`, the cache's quota or a
 * full localStorage), leaving nothing behind.
 */
export function keep(
  store: Store,
  files: KeptFiles,
  id: string,
  info: KeepInfo,
  story: StoryData,
  now: number,
): Promise<KeptEntry> {
  const packed = pack(story);
  if (!files.fits(packed.length)) return Promise.reject(new Error('Too large to keep here'));
  const game = JSON.stringify(info.game);
  const entry: KeptEntry = {
    url: info.url,
    kind: info.kind,
    title: info.title,
    author: info.author,
    size: packed.length + game.length,
    date: now,
    where: files.where,
  };
  if (packed !== story.bytes) entry.files = 1;
  if (info.auto) entry.auto = 1;
  return files
    .write(id, { story: packed, game: game })
    .then(() => {
      try {
        setKept(store, id, entry);
      } catch (error) {
        return files.remove(id).then(() => Promise.reject(error));
      }
      store.remove(keys.file(id));
      return files.setKinds(keptKinds(getKept(store)));
    })
    .then(() => entry);
}

/**
 * The kept story of `id` if it is the version at `url`, else null: not kept, an older version, or its files are gone
 * (the browser may drop them: `persist()` is refused on the Kindle).
 */
export function readKeptStory(
  store: Store,
  files: KeptFiles,
  id: string,
  url: string,
): Promise<StoryData | null> {
  const entry = getKept(store)[id];
  if (!entry || entry.url !== url || entry.where !== files.where) return Promise.resolve(null);
  return files.readStory(id).then(
    (bytes) => {
      if (!bytes) return null;
      return entry.files ? unpack(bytes) : { bytes: bytes };
    },
    () => null,
  );
}

/** The kept page data of `id` (parsed JSON), or null. */
export function readKeptGame(store: Store, files: KeptFiles, id: string): Promise<unknown> {
  const entry = getKept(store)[id];
  if (!entry || entry.where !== files.where) return Promise.resolve(null);
  return files.readGame(id).then(
    (text) => {
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/** Removes a kept adventure from the device: its files, then its entry. Its saves and progress stay. */
export function unkeep(store: Store, files: KeptFiles, id: string): Promise<void> {
  return files.remove(id).then(() => {
    dropKept(store, id);
    return files.setKinds(keptKinds(getKept(store)));
  });
}

/** Removes the kept files of the Cache API (Reset all data, which removes the localStorage ones with every key). */
export function clearKeptCache(env: Env = defaultEnv()): Promise<void> {
  if (env.caches && typeof env.caches.delete === 'function') {
    return env.caches.delete(KEPT_CACHE).then(() => undefined);
  }
  return Promise.resolve();
}
