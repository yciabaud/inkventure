import { openBackend } from './backend';
import { runMigrations } from './migrations';
import { createStore, type Store } from './store';

export { compressBytes, compressText, decompressBytes, decompressText } from './compress';
export { gameId, keys, parseGameId } from './keys';
export {
  addToHome,
  continueGame,
  getHome,
  inProgressTuids,
  isInHome,
  myAdventures,
  removeFromHome,
  sortRecent,
  type Adventure,
  type HomeEntry,
} from './home';
export {
  AUTO_KEEP_BUDGET,
  getKept,
  isKept,
  keptEntry,
  keptSize,
  type KeptEntry,
  type KeptList,
} from './kept';
export { getPrefs, setPrefs, type Prefs } from './prefs';
export type { StorageUsage, UsageGroup } from './usage';
export { isStorageFullError, type StorageEvent, type StorageFullError, type Store } from './store';

let instance: Store | undefined;

/** The app-wide store over localStorage (or memory when unavailable), migrated on first use. */
export function getStore(): Store {
  if (!instance) {
    const { backend, persistent } = openBackend();
    try {
      runMigrations(backend);
    } catch (error) {
      console.error('Storage migrations failed', error);
    }
    instance = createStore(backend, { persistent });
  }
  return instance;
}
