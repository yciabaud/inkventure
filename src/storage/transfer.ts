// Export / import of the player's data as a text code (SPEC §6.3; story S5.2). The code is the JSON of prefs, My
// adventures, progress records and saves, deflated, checked with a CRC-32 and base64-encoded in groups.
// Imported directly and lazily (not from index.ts): it pulls in the deflate library.
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { autosaveTuid, keys } from './keys';
import { latestVersion, MIGRATIONS } from './migrations';
import type { Store } from './store';

/** Version of the code format itself (the header); the storage schema version travels inside. */
export const FORMAT_VERSION = 1;
const MAGIC = 'INKVENTURE';
const GROUP = 8;
const GROUPS_PER_LINE = 6;

/** What a code holds: store entries (keys without the `ik:v1:` prefix) and when it was made. */
export interface Backup {
  schema: number;
  date: number;
  entries: Record<string, unknown>;
}

export type DecodeError = 'empty' | 'format' | 'checksum' | 'newer';

export type DecodeResult = { ok: true; backup: Backup } | { ok: false; error: DecodeError };

export type ImportMode = 'merge' | 'overwrite';

const SLOT = /^save:(.+):([^:]+)$/;
const PROGRESS = /^progress:(.+)$/;

/** Entries a code carries: prefs, My adventures, progress records, autosaves and named slots (no cached files). */
export function isExportable(key: string): boolean {
  return key === keys.prefs || key === keys.home || PROGRESS.test(key) || SLOT.test(key);
}

function isNamedSlot(key: string): boolean {
  return SLOT.test(key) && autosaveTuid(key) === undefined;
}

// --- CRC-32 (IEEE), over the deflated bytes -----------------------------------------------------------------------

let crcTable: number[] | undefined;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable.push(c >>> 0);
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function hex8(n: number): string {
  const text = n.toString(16);
  return '00000000'.slice(text.length) + text;
}

// --- base64 ----------------------------------------------------------------------------------------------------------

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.prototype.slice.call(bytes, i, i + CHUNK) as number[],
    );
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | undefined {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Codec -----------------------------------------------------------------------------------------------------------

/** The exportable entries of the store, as a backup made at `date`. */
export function collectBackup(store: Store, date: number): Backup {
  const entries: Record<string, unknown> = {};
  const all = store.keys().sort();
  for (let i = 0; i < all.length; i++) {
    if (!isExportable(all[i])) continue;
    const value = store.get(all[i]);
    if (value !== undefined) entries[all[i]] = value;
  }
  return { schema: latestVersion(MIGRATIONS), date: date, entries: entries };
}

/** "INKVENTURE 1 <crc>" then the base64 in groups of 8 characters, 6 groups a line (fits the code box on the baseline screen). */
export function encodeBackup(backup: Backup): string {
  const packed = deflateSync(strToU8(JSON.stringify(backup)), { level: 9 });
  const body = toBase64(packed);
  const lines: string[] = [];
  let line: string[] = [];
  for (let i = 0; i < body.length; i += GROUP) {
    line.push(body.slice(i, i + GROUP));
    if (line.length === GROUPS_PER_LINE) {
      lines.push(line.join(' '));
      line = [];
    }
  }
  if (line.length) lines.push(line.join(' '));
  return MAGIC + ' ' + FORMAT_VERSION + ' ' + hex8(crc32(packed)) + '\n' + lines.join('\n');
}

const HEADER = /^\s*INKVENTURE\s+(\d+)\s+([0-9a-fA-F]{8})\s+([\s\S]*)$/;

/**
 * Reads a code as pasted (any spacing and line breaks). Fails with `empty`, `format` (not an Inkventure code),
 * `checksum` (damaged or incomplete) or `newer` (made by a newer version of the app).
 */
export function decodeBackup(text: string): DecodeResult {
  if (!text || !text.replace(/\s+/g, '')) return { ok: false, error: 'empty' };
  const match = HEADER.exec(text);
  if (!match) return { ok: false, error: 'format' };
  if (parseInt(match[1], 10) !== FORMAT_VERSION) {
    return { ok: false, error: parseInt(match[1], 10) > FORMAT_VERSION ? 'newer' : 'format' };
  }
  const body = match[3].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) return { ok: false, error: 'checksum' };
  const packed = fromBase64(body);
  if (!packed || crc32(packed) !== parseInt(match[2], 16)) return { ok: false, error: 'checksum' };
  let backup: Backup;
  try {
    backup = JSON.parse(strFromU8(inflateSync(packed))) as Backup;
  } catch {
    return { ok: false, error: 'format' };
  }
  if (
    !backup ||
    typeof backup.schema !== 'number' ||
    typeof backup.date !== 'number' ||
    !backup.entries ||
    typeof backup.entries !== 'object'
  ) {
    return { ok: false, error: 'format' };
  }
  if (backup.schema > latestVersion(MIGRATIONS)) return { ok: false, error: 'newer' };
  // Only the entries a code may carry, with the shape the app expects; anything else is dropped.
  const entries: Record<string, unknown> = {};
  const names = Object.keys(backup.entries);
  for (let i = 0; i < names.length; i++) {
    const value = backup.entries[names[i]];
    if (isExportable(names[i]) && isValid(names[i], value)) entries[names[i]] = value;
  }
  return { ok: true, backup: { schema: backup.schema, date: backup.date, entries: entries } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValid(key: string, value: unknown): boolean {
  if (key === keys.home) return Array.isArray(value);
  if (SLOT.test(key)) {
    return (
      isObject(value) &&
      typeof value.data === 'string' &&
      typeof value.text === 'string' &&
      typeof value.turn === 'number'
    );
  }
  return isObject(value);
}

// --- Summary & import ----------------------------------------------------------------------------------------------

/** What a set of entries holds, for the import preview. */
export interface Contents {
  settings: boolean;
  adventures: number;
  saves: number;
  autosaves: number;
}

export function contentsOf(entries: Record<string, unknown>): Contents {
  const home = entries[keys.home];
  const contents: Contents = {
    settings: entries[keys.prefs] !== undefined,
    adventures: Array.isArray(home) ? home.length : 0,
    saves: 0,
    autosaves: 0,
  };
  const names = Object.keys(entries);
  for (let i = 0; i < names.length; i++) {
    if (autosaveTuid(names[i]) !== undefined) contents.autosaves++;
    else if (isNamedSlot(names[i])) contents.saves++;
  }
  return contents;
}

/** The exportable entries of this device (for the preview: what an import replaces). */
export function localEntries(store: Store): Record<string, unknown> {
  return collectBackup(store, 0).entries;
}

export interface ImportPlan {
  /** Entries to write, with their new value. */
  writes: Record<string, unknown>;
  /** Entries to delete (overwrite only: those of this device the code does not have). */
  removes: string[];
  /** Named saves of this device that the import replaces or deletes. */
  replacedSaves: number;
}

function dateOf(value: unknown, field: 'date' | 'lastPlayed'): number {
  const date = isObject(value) ? value[field] : undefined;
  return typeof date === 'number' ? date : 0;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface HomeItem {
  tuid: string;
  added?: number;
}

/** My adventures of both sides: this device's entries, then the code's other games, most recently added first. */
function mergeHome(local: unknown, incoming: unknown): unknown[] {
  const mine = (Array.isArray(local) ? local : []) as HomeItem[];
  const theirs = (Array.isArray(incoming) ? incoming : []) as HomeItem[];
  const seen: Record<string, boolean> = {};
  const all: HomeItem[] = [];
  const both = mine.concat(theirs);
  for (let i = 0; i < both.length; i++) {
    const item = both[i];
    if (!item || typeof item.tuid !== 'string' || seen[item.tuid]) continue;
    seen[item.tuid] = true;
    all.push(item);
  }
  // Stable sort (older engines' sort is not): the index breaks ties.
  const indexed = all.map((item, index) => ({ item: item, index: index }));
  indexed.sort((a, b) => (b.item.added || 0) - (a.item.added || 0) || a.index - b.index);
  return indexed.map((entry) => entry.item);
}

/**
 * What importing `incoming` does to `local` (both: store entries by key).
 *
 * - `overwrite`: this device's entries become exactly the code's (cached story files are kept).
 * - `merge`: settings of this device win, the code only adds missing ones; My adventures is the union (this device's
 *   entry wins for a game on both); a progress record, an autosave or a named slot on both sides is the newer one
 *   (`lastPlayed` / `date`; this device's on a tie).
 */
export function planImport(
  local: Record<string, unknown>,
  incoming: Record<string, unknown>,
  mode: ImportMode,
): ImportPlan {
  const plan: ImportPlan = { writes: {}, removes: [], replacedSaves: 0 };
  const localKeys = Object.keys(local);
  const incomingKeys = Object.keys(incoming);

  function write(key: string, value: unknown) {
    if (same(local[key], value)) return;
    plan.writes[key] = value;
    if (local[key] !== undefined && isNamedSlot(key)) plan.replacedSaves++;
  }

  if (mode === 'overwrite') {
    for (let i = 0; i < localKeys.length; i++) {
      if (incoming[localKeys[i]] !== undefined) continue;
      plan.removes.push(localKeys[i]);
      if (isNamedSlot(localKeys[i])) plan.replacedSaves++;
    }
    for (let i = 0; i < incomingKeys.length; i++) write(incomingKeys[i], incoming[incomingKeys[i]]);
    return plan;
  }

  for (let i = 0; i < incomingKeys.length; i++) {
    const key = incomingKeys[i];
    const theirs = incoming[key];
    const mine = local[key];
    if (mine === undefined) {
      write(key, theirs);
    } else if (key === keys.prefs) {
      write(key, { ...(theirs as object), ...(mine as object) });
    } else if (key === keys.home) {
      write(key, mergeHome(mine, theirs));
    } else if (PROGRESS.test(key)) {
      if (dateOf(theirs, 'lastPlayed') > dateOf(mine, 'lastPlayed')) write(key, theirs);
    } else if (dateOf(theirs, 'date') > dateOf(mine, 'date')) {
      write(key, theirs);
    }
  }
  return plan;
}

/**
 * Applies an import. All or nothing: when the storage fills up half-way, the entries already changed (and the
 * autosaves evicted to make room) are put back as they were and the `StorageFullError` is thrown.
 */
export function applyImport(store: Store, backup: Backup, mode: ImportMode): ImportPlan {
  const local = localEntries(store);
  const plan = planImport(local, backup.entries, mode);
  const touched: string[] = [];
  // Making room may evict stale autosaves of this device: they are put back too if the import fails.
  const unsubscribe = store.subscribe((event) => {
    if (event.type === 'evicted' && local[event.key] !== undefined) touched.push(event.key);
  });
  try {
    // Deletions first: they make room for the writes.
    for (let i = 0; i < plan.removes.length; i++) {
      touched.push(plan.removes[i]);
      store.remove(plan.removes[i]);
    }
    const writes = Object.keys(plan.writes);
    for (let i = 0; i < writes.length; i++) {
      touched.push(writes[i]);
      store.set(writes[i], plan.writes[writes[i]]);
    }
  } catch (error) {
    unsubscribe();
    for (let i = touched.length - 1; i >= 0; i--) {
      const key = touched[i];
      try {
        if (local[key] === undefined) store.remove(key);
        else store.set(key, local[key]);
      } catch {
        // Best effort: removing the imported entries first freed the room the old ones used.
      }
    }
    throw error;
  } finally {
    unsubscribe();
  }
  return plan;
}
