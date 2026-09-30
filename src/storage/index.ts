import { openBackend } from './backend';
import { runMigrations } from './migrations';
import { createStore, type Store } from './store';

export { compressBytes, compressText, decompressBytes, decompressText } from './compress';
export { keys } from './keys';
export { addToHome, getHome, isInHome, removeFromHome, type HomeEntry } from './home';
export { getPrefs, setPrefs, type Prefs } from './prefs';
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
