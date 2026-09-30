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
  /** IFDB has cover art for it (its thumbnail can be shown). */
  cover?: boolean;
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
  game: { tuid: string; title: string; author: string; cover?: unknown },
  now: number,
): HomeEntry[] {
  const list = getHome(store);
  if (list.some((entry) => entry.tuid === game.tuid)) return list;
  const entry: HomeEntry = { tuid: game.tuid, title: game.title, author: game.author, added: now };
  if (game.cover) entry.cover = true;
  const next = [entry].concat(list);
  store.set(keys.home, next);
  return next;
}

/**
 * Removes the game from the list. Its saves (autosave and named slots) and progress record stay, unless
 * `deleteSaves`; its cached story file stays either way (it is evicted when room is needed).
 */
export function removeFromHome(
  store: Store,
  tuid: string,
  options: { deleteSaves?: boolean } = {},
): HomeEntry[] {
  const next = getHome(store).filter((entry) => entry.tuid !== tuid);
  store.set(keys.home, next);
  if (options.deleteSaves) {
    const prefix = 'save:' + tuid + ':';
    const all = store.keys();
    for (let i = 0; i < all.length; i++) {
      if (all[i].indexOf(prefix) === 0 || all[i] === keys.progress(tuid)) store.remove(all[i]);
    }
  }
  return next;
}

/** A game of My adventures with what its progress record says. */
export interface Adventure extends HomeEntry {
  /** Turns played, once started. */
  turns?: number;
}

/** My adventures with their progress (turns, last played), in the stored order (most recently added first). */
export function myAdventures(store: Store): Adventure[] {
  return getHome(store).map((entry) => {
    const progress = store.get<{ turns?: unknown; lastPlayed?: unknown }>(
      keys.progress(entry.tuid),
    );
    const adventure: Adventure = { ...entry };
    if (progress && typeof progress.lastPlayed === 'number')
      adventure.lastPlayed = progress.lastPlayed;
    if (progress && typeof progress.turns === 'number') adventure.turns = progress.turns;
    return adventure;
  });
}

/** Last played (or added, for a game never played) first. */
export function sortRecent(list: Adventure[]): Adventure[] {
  const recent = (a: Adventure) => Math.max(a.lastPlayed || 0, a.added || 0);
  return list.slice().sort((a, b) => recent(b) - recent(a));
}

/** The game the Continue hero offers: the last one played among My adventures, if any was started. */
export function continueGame(list: Adventure[]): Adventure | undefined {
  let best: Adventure | undefined;
  for (let i = 0; i < list.length; i++) {
    const lastPlayed = list[i].lastPlayed;
    if (lastPlayed && (!best || lastPlayed > (best.lastPlayed as number))) best = list[i];
  }
  return best;
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
