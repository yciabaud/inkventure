// Storage usage summary for Settings (SPEC §6.1; story S5.1). Sizes are in characters (keys + values), which is how
// browsers count the localStorage quota.
import { autosaveTuid, isFileKey, isKeptFileKey, PREFIX } from './keys';

export interface UsageGroup {
  count: number;
  size: number;
}

export interface StorageUsage {
  /** Every `ik:` entry, the schema key included. */
  total: number;
  /** Named save slots. */
  saves: UsageGroup;
  autosaves: UsageGroup;
  /** Cached story files. */
  files: UsageGroup;
  /** Story files kept offline in localStorage (S5.3; the Cache API's are counted by the kept list). */
  kept: UsageGroup;
  /** Everything else: preferences, My adventures, progress records, LRU list, schema version. */
  other: UsageGroup;
}

const SAVE = /^save:.+:[^:]+$/;

/** Sums `entries` (raw backend keys and value lengths); keys outside the app's `ik:` namespace are ignored. */
export function computeUsage(entries: Array<{ key: string; length: number }>): StorageUsage {
  const usage: StorageUsage = {
    total: 0,
    saves: { count: 0, size: 0 },
    autosaves: { count: 0, size: 0 },
    files: { count: 0, size: 0 },
    kept: { count: 0, size: 0 },
    other: { count: 0, size: 0 },
  };
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i].key;
    if (!isAppKey(raw)) continue;
    const size = raw.length + entries[i].length;
    const key = raw.indexOf(PREFIX) === 0 ? raw.slice(PREFIX.length) : '';
    let group = usage.other;
    if (isFileKey(key)) group = usage.files;
    else if (isKeptFileKey(key)) group = usage.kept;
    else if (autosaveTuid(key) !== undefined) group = usage.autosaves;
    else if (SAVE.test(key)) group = usage.saves;
    group.count++;
    group.size += size;
    usage.total += size;
  }
  return usage;
}

/** Keys the app owns (and a reset removes): everything under `ik:`, whatever the schema version. */
export function isAppKey(key: string): boolean {
  return key.indexOf('ik:') === 0;
}
