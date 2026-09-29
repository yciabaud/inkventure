// Key layout (SPEC §6.1). Store keys are given without the `ik:v1:` prefix, which the store adds.

export const PREFIX = 'ik:v1:';
export const SCHEMA_KEY = 'ik:schema';

export const keys = {
  prefs: 'prefs',
  home: 'home',
  lru: 'lru',
  progress: (tuid: string) => 'progress:' + tuid,
  autosave: (tuid: string) => 'save:' + tuid + ':auto',
  /** Named save slot; `auto` is reserved for the autosave. */
  save: (tuid: string, slot: string) => {
    if (slot === 'auto') throw new Error('Save slot "auto" is reserved');
    return 'save:' + tuid + ':' + slot;
  },
  file: (tuid: string) => 'file:' + tuid,
};

const AUTOSAVE = /^save:(.+):auto$/;

export function isFileKey(key: string): boolean {
  return key.indexOf('file:') === 0;
}

/** The tuid of an autosave key, or undefined for any other key. */
export function autosaveTuid(key: string): string | undefined {
  const match = AUTOSAVE.exec(key);
  return match ? match[1] : undefined;
}

/** Entries that may be evicted to make room: cached story files and autosaves (never named saves). */
export function isEvictable(key: string): boolean {
  return isFileKey(key) || autosaveTuid(key) !== undefined;
}
