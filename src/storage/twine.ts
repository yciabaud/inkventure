// A Twine story's own storage (SPEC §4.3; story S1.9): the story runs in a sandboxed frame without real
// localStorage / sessionStorage, so the reader keeps what the story format stores there (its saves, SugarCube's
// session) under `save:<tuid>:twine`. It counts as a named save: never evicted, removed with the game's saves.
// Imported directly and lazily, like saves.ts.
import { keys } from './keys';
import type { Store } from './store';

export type StorageItems = Record<string, string>;

export interface TwineStorage {
  local: StorageItems;
  session: StorageItems;
}

interface TwineRecord extends TwineStorage {
  v: 1;
  date: number;
}

/** A story may keep at most this many characters (keys + values): a runaway story cannot fill the device. */
export const TWINE_MAX_CHARS = 1000000;

/** `value` as storage items: string keys to string values, anything else dropped. */
export function toItems(value: unknown): StorageItems {
  const items: StorageItems = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return items;
  const source = value as Record<string, unknown>;
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key) && typeof source[key] === 'string')
      items[key] = source[key] as string;
  }
  return items;
}

export function itemsSize(items: StorageItems): number {
  let size = 0;
  for (const key in items) size += key.length + items[key].length;
  return size;
}

/** The story's saved storage (empty areas when none). */
export function readTwineStorage(store: Store, tuid: string): TwineStorage {
  const record = store.get<Partial<TwineRecord>>(keys.twine(tuid));
  const valid = !!record && record.v === 1;
  return {
    local: valid ? toItems(record.local) : {},
    session: valid ? toItems(record.session) : {},
  };
}

/**
 * Saves the story's storage. Returns false, writing nothing, when it is over TWINE_MAX_CHARS; throws a
 * `StorageFullError` when the device storage is full.
 */
export function writeTwineStorage(
  store: Store,
  tuid: string,
  storage: TwineStorage,
  date: number,
): boolean {
  if (itemsSize(storage.local) + itemsSize(storage.session) > TWINE_MAX_CHARS) return false;
  const record: TwineRecord = { v: 1, date: date, local: storage.local, session: storage.session };
  store.set(keys.twine(tuid), record);
  return true;
}
