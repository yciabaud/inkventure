// "My adventures" (SPEC §3.3, §6.1): `ik:v1:home`, the games the player added from their page or started, most
// recently added first. Title and author are kept so Home can list them without loading the catalogue.
import { autosaveTuid, keys } from './keys';
import type { Store } from './store';

export interface HomeEntry {
  tuid: string;
  title: string;
  author: string;
  /** When it was added (ms). */
  added: number;
  /** When it was last played (ms), once started. */
  lastPlayed?: number;
}

export function getHome(store: Store): HomeEntry[] {
  const list = store.get<HomeEntry[]>(keys.home);
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => !!entry && typeof entry.tuid === 'string');
}

export function isInHome(store: Store, tuid: string): boolean {
  return getHome(store).some((entry) => entry.tuid === tuid);
}

/** Adds the game at the top of the list; a game already there keeps its place and dates. */
export function addToHome(
  store: Store,
  game: { tuid: string; title: string; author: string },
  now: number,
): HomeEntry[] {
  const list = getHome(store);
  if (list.some((entry) => entry.tuid === game.tuid)) return list;
  const next = [{ tuid: game.tuid, title: game.title, author: game.author, added: now }].concat(
    list,
  );
  store.set(keys.home, next);
  return next;
}

/** Removes the game from the list; its saves and progress stay. */
export function removeFromHome(store: Store, tuid: string): HomeEntry[] {
  const next = getHome(store).filter((entry) => entry.tuid !== tuid);
  store.set(keys.home, next);
  return next;
}

const PROGRESS = /^progress:(.+)$/;

/**
 * The games already in progress: those with a progress record or an autosave (started) and those in My adventures.
 * The Featured shelf leaves them out.
 */
export function inProgressTuids(store: Store): Record<string, boolean> {
  const tuids: Record<string, boolean> = {};
  const all = store.keys();
  for (let i = 0; i < all.length; i++) {
    const progress = PROGRESS.exec(all[i]);
    const tuid = progress ? progress[1] : autosaveTuid(all[i]);
    if (tuid) tuids[tuid] = true;
  }
  const home = getHome(store);
  for (let i = 0; i < home.length; i++) tuids[home[i].tuid] = true;
  return tuids;
}
