import { getPrefs, getStore, setPrefs, type Prefs } from '../storage';

declare global {
  interface Window {
    /** Debug / e2e hook: read and write prefs without a UI (the Settings screen arrives in S5.1). */
    __inkventure?: {
      getPrefs(): Prefs;
      setPrefs(patch: Partial<Prefs>): Prefs;
      persistent: boolean;
    };
  }
}

export function installTestHook() {
  const store = getStore();
  window.__inkventure = {
    getPrefs: () => getPrefs(store),
    setPrefs: (patch) => setPrefs(store, patch),
    persistent: store.persistent,
  };
}
