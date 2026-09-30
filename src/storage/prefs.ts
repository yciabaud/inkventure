import { keys } from './keys';
import type { Store } from './store';

/** `ik:v1:prefs` (SPEC §6.1). Reader defaults are refined by S1.2. */
export interface Prefs {
  /** UI language override; absent means "follow the browser". */
  locale?: string;
  reader?: Record<string, string | number>;
  libraryView?: 'list' | 'grid';
}

export function getPrefs(store: Store): Prefs {
  const prefs = store.get<Prefs>(keys.prefs);
  return prefs && typeof prefs === 'object' ? prefs : {};
}

/** Shallow-merges `patch` (an `undefined` value removes the field) and returns the new prefs. */
export function setPrefs(store: Store, patch: Partial<Prefs>): Prefs {
  const next: Prefs = { ...getPrefs(store), ...patch };
  const names = Object.keys(next) as Array<keyof Prefs>;
  for (let i = 0; i < names.length; i++) {
    if (next[names[i]] === undefined) delete next[names[i]];
  }
  store.set(keys.prefs, next);
  return next;
}
