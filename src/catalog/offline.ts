// Keeping adventures offline (SPEC §6.2; story S5.3): "Keep offline" downloads a game's story and keeps it with its
// page data; starting a game keeps it automatically while the kept adventures stay within a budget. Imported lazily.
import { container } from '../app/offline';
import { engineFor, isAvailable } from '../engines/formats';
import {
  addToHome,
  AUTO_KEEP_BUDGET,
  getKept,
  isStorageFullError,
  keptSize,
  parseGameId,
  type KeptEntry,
} from '../storage';
import {
  clearKeptCache,
  keep,
  keptFiles,
  keptStorySize,
  readKeptGame,
  readKeptStory,
  unkeep,
} from '../storage/keptFiles';
import type { Store } from '../storage/store';
import { loadGameOrKept, versionOf, type GameDetail, type GameVersion } from './game';
import { fetchStory, type DownloadProgress, type StoryData } from './storyFile';

/** How long to wait for the Service Worker to cache an engine. */
const ENGINE_TIMEOUT_MS = 60000;

/** Asks the Service Worker to cache the engines of `kinds`; true once it has. False without a worker. */
export function cacheEngines(kinds: string[]): Promise<boolean> {
  const sw = container();
  if (!sw || typeof MessageChannel === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ENGINE_TIMEOUT_MS);
    sw.ready.then(
      (registration) => {
        const worker = registration.active;
        if (!worker) {
          clearTimeout(timer);
          resolve(false);
          return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = (event: MessageEvent) => {
          clearTimeout(timer);
          resolve(!!(event.data && event.data.ok));
        };
        worker.postMessage({ type: 'engines', kinds: kinds }, [channel.port2]);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/** The version of `detail` played under `version.id` (its own file and language). */
function played(detail: GameDetail, version: GameVersion): GameDetail {
  return { ...detail, tuid: version.id, file: version.file, language: version.language };
}

function keepInfo(detail: GameDetail, version: GameVersion, kind: string, auto?: boolean) {
  return {
    url: version.file.url,
    kind: kind,
    title: detail.title,
    author: detail.author,
    game: detail,
    auto: auto,
  };
}

/**
 * The `keep` option of `fetchStory` for a game being started: keeps it when it fits the budget (it is then no longer
 * cached in localStorage). Resolves false when it is not kept.
 */
export function autoKeeper(
  store: Store,
  detail: GameDetail,
  version: GameVersion,
): (story: StoryData) => Promise<boolean> {
  return (story) => {
    const kind = engineFor(detail.format);
    const list = getKept(store);
    const kept = list[version.id];
    if (!kind) return Promise.resolve(false);
    if (kept && kept.url === version.file.url) return Promise.resolve(true);
    const files = keptFiles(store);
    const size = keptStorySize(story);
    const others = keptSize(list) - (kept ? kept.size : 0);
    if (!files.fits(size) || others + size > AUTO_KEEP_BUDGET) return Promise.resolve(false);
    return keep(
      store,
      files,
      version.id,
      keepInfo(detail, version, kind, true),
      story,
      Date.now(),
    ).then(
      () => {
        void cacheEngines([kind]);
        return true;
      },
      () => false,
    );
  };
}

/**
 * "Keep offline": downloads the story of `version` (or takes it from the cache), keeps it with the game's page data,
 * adds the game to My adventures and has the Service Worker keep its engine. Rejects when it cannot be downloaded or
 * there is no room.
 */
export function keepGame(
  store: Store,
  detail: GameDetail,
  version: GameVersion,
  onProgress?: DownloadProgress,
): { promise: Promise<KeptEntry>; abort(): void } {
  const kind = engineFor(detail.format);
  if (!kind || !isAvailable(kind)) {
    return { promise: Promise.reject(new Error('Not playable')), abort: () => undefined };
  }
  // Not written to the story file cache: it is kept instead.
  const loading = fetchStory(played(detail, version), kind, store, {
    onProgress: onProgress,
    defer: () => undefined,
  });
  return {
    promise: loading.promise
      .then((story) =>
        keep(
          store,
          keptFiles(store),
          version.id,
          keepInfo(detail, version, kind),
          story,
          Date.now(),
        ),
      )
      .then((entry) => {
        try {
          addToHome(store, { ...detail, tuid: version.id }, Date.now());
        } catch (error) {
          if (!isStorageFullError(error)) throw error;
        }
        return cacheEngines([kind]).then(() => entry);
      }),
    abort: loading.abort,
  };
}

/** Keep offline from My adventures' menu: the game's page data first (the catalogue's, or the kept copy). */
export function keepAdventure(store: Store, id: string): Promise<KeptEntry> {
  return loadGameOrKept(parseGameId(id).tuid, id).then((result) => {
    const version = result.status === 'ready' ? versionOf(result.game, id) : undefined;
    if (result.status !== 'ready' || !version) throw new Error('Not in the catalogue: ' + id);
    return keepGame(store, result.game, version).promise;
  });
}

/** The kept story of the game `id` at `url` (null when not kept, another version, or its files are gone). */
export function readKept(store: Store, id: string, url: string): Promise<StoryData | null> {
  return readKeptStory(store, keptFiles(store), id, url);
}

/** The kept page data of the game `id`, or null. */
export function readKeptDetail(store: Store, id: string): Promise<unknown> {
  return readKeptGame(store, keptFiles(store), id);
}

/** "Remove from device": its files and entry; saves and progress stay. */
export function removeKept(store: Store, id: string): Promise<void> {
  return unkeep(store, keptFiles(store), id);
}

export { clearKeptCache };
