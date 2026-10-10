// A Decker deck's state (SPEC §4.4; story S1.29): a deck keeps its state in itself (fields, widgets, the current card),
// so the reader keeps the whole deck as Decker writes it, under `save:<tuid>:decker`, and opens it instead of the
// original next time. It counts as a named save: never evicted, removed with the game's saves. Imported directly and
// lazily, like saves.ts.
import { keys } from './keys';
import type { Store } from './store';

interface DeckerRecord {
  v: 1;
  date: number;
  deck: string;
}

/** A saved deck may be at most this many characters: a larger deck plays, but does not resume. */
export const DECKER_MAX_CHARS = 1000000;

/** The deck as the player left it, or null. */
export function readDeckerSave(store: Store, tuid: string): string | null {
  const record = store.get<Partial<DeckerRecord>>(keys.decker(tuid));
  return record && record.v === 1 && typeof record.deck === 'string' ? record.deck : null;
}

/**
 * Keeps the deck. Returns false, writing nothing, when it is over DECKER_MAX_CHARS; throws a `StorageFullError` when
 * the device storage is full.
 */
export function writeDeckerSave(store: Store, tuid: string, deck: string, date: number): boolean {
  if (deck.length > DECKER_MAX_CHARS) return false;
  const record: DeckerRecord = { v: 1, date: date, deck: deck };
  store.set(keys.decker(tuid), record);
  return true;
}

/** Restart: the deck opens as published next time. */
export function clearDeckerSave(store: Store, tuid: string): void {
  store.remove(keys.decker(tuid));
}
