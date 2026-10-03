// Adventures kept offline (SPEC §6.2; story S5.3): the list of what is kept, under `ik:v1:kept`, read synchronously so
// that Home and the game page can say at once whether a game plays without Wi-Fi. The files themselves are in the
// Cache API (or localStorage), see keptFiles.ts, which is imported lazily.
import { keys } from './keys';
import type { Store } from './store';

/** Games started are kept automatically while all kept adventures take less than this (S5.3). */
export const AUTO_KEEP_BUDGET = 40 * 1024 * 1024;

/** Where a kept adventure's files are. */
export type KeptWhere = 'cache' | 'local';

export interface KeptEntry {
  /** The story file's catalogue URL: a new URL is a new version, downloaded again. */
  url: string;
  /** The engine that plays it (the offline app keeps that engine's chunks). */
  kind: string;
  title: string;
  author: string;
  /** Bytes stored for it, counted by the app (the Kindle's `storage.estimate()` under-reports): story, its files and
   * the game's page data. */
  size: number;
  /** When it was kept (ms). */
  date: number;
  where: KeptWhere;
  /** The stored story is a zip of the story and its files (a Twine story, S1.11). */
  files?: 1;
  /** Kept when the game was started, rather than with "Keep offline". */
  auto?: 1;
}

export type KeptList = Record<string, KeptEntry>;

function isEntry(value: unknown): value is KeptEntry {
  const entry = value as KeptEntry | undefined;
  return !!entry && typeof entry.url === 'string' && typeof entry.size === 'number';
}

/** The kept adventures by game id; unreadable entries are left out. */
export function getKept(store: Store): KeptList {
  const stored = store.get<KeptList>(keys.kept);
  const list: KeptList = {};
  if (!stored || typeof stored !== 'object') return list;
  for (const id of Object.keys(stored)) if (isEntry(stored[id])) list[id] = stored[id];
  return list;
}

export function keptEntry(store: Store, id: string): KeptEntry | undefined {
  return getKept(store)[id];
}

export function isKept(store: Store, id: string): boolean {
  return !!keptEntry(store, id);
}

/** Bytes used by every kept adventure. */
export function keptSize(list: KeptList): number {
  let total = 0;
  for (const id of Object.keys(list)) total += list[id].size;
  return total;
}
