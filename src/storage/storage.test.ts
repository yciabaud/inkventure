import { describe, expect, it, vi } from 'vitest';
import { isQuotaError, MemoryBackend, openBackend, type KeyValueBackend } from './backend';
import { compressBytes, compressText, decompressBytes, decompressText } from './compress';
import { keys, PREFIX, SCHEMA_KEY } from './keys';
import { latestVersion, MIGRATIONS, runMigrations, type Migration } from './migrations';
import { getPrefs, setPrefs } from './prefs';
import { createStore, isStorageFullError, STALE_AUTOSAVE_MS, type StorageEvent } from './store';

const NOW = Date.UTC(2026, 8, 1);
const DAY = 24 * 60 * 60 * 1000;

function setup(quota = Infinity) {
  const backend = new MemoryBackend(quota);
  const store = createStore(backend, { now: () => NOW });
  const events: StorageEvent[] = [];
  store.subscribe((e) => events.push(e));
  return { backend, store, events };
}

describe('store basics', () => {
  it('round-trips JSON values under the ik:v1: prefix', () => {
    const { backend, store } = setup();
    store.set('home', [{ tuid: 'abc', added: 1 }]);
    expect(store.get('home')).toEqual([{ tuid: 'abc', added: 1 }]);
    expect(backend.getItem('ik:v1:home')).toBe('[{"tuid":"abc","added":1}]');
    store.set('n', 0);
    store.set('s', '');
    expect(store.get('n')).toBe(0);
    expect(store.get('s')).toBe('');
    store.remove('home');
    expect(store.get('home')).toBeUndefined();
  });

  it('returns undefined for missing or corrupt values', () => {
    const { backend, store } = setup();
    backend.setItem(PREFIX + 'prefs', '{not json');
    expect(store.get('prefs')).toBeUndefined();
    expect(store.get('missing')).toBeUndefined();
  });

  it('lists only its own keys, without prefix', () => {
    const { backend, store } = setup();
    backend.setItem('other', 'x');
    backend.setItem(SCHEMA_KEY, '1');
    store.set('prefs', {});
    expect(store.keys()).toEqual(['prefs']);
  });

  it('reserves the "auto" slot name', () => {
    expect(keys.autosave('t')).toBe('save:t:auto');
    expect(keys.save('t', '1')).toBe('save:t:1');
    expect(() => keys.save('t', 'auto')).toThrow();
  });

  it('rethrows errors other than quota errors', () => {
    const backend = new MemoryBackend();
    backend.setItem = () => {
      throw new TypeError('boom');
    };
    expect(() => createStore(backend).set('a', 1)).toThrow(TypeError);
  });
});

describe('backend', () => {
  it('recognises quota errors from every browser generation', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it('uses localStorage when it works', () => {
    const local = new MemoryBackend();
    const opened = openBackend(() => local);
    expect(opened).toEqual({ backend: local, persistent: true });
    expect(local.length).toBe(0);
  });

  it('falls back to memory when localStorage is missing or throws', () => {
    const missing = openBackend(() => null);
    expect(missing.persistent).toBe(false);
    expect(missing.backend).toBeInstanceOf(MemoryBackend);

    const denied = openBackend(() => {
      throw new Error('SecurityError');
    });
    expect(denied.persistent).toBe(false);

    // Old Safari private mode: readable, but every write throws a quota error on an empty storage.
    const readOnly = new MemoryBackend(0);
    expect(openBackend(() => readOnly).persistent).toBe(false);
  });

  it('keeps a localStorage that is merely full', () => {
    const full = new MemoryBackend(10);
    full.setItem('ik:v1:a', '12');
    const opened = openBackend(() => full);
    expect(opened).toEqual({ backend: full, persistent: true });
  });

  it('the memory fallback works as a store but is flagged as not persistent', () => {
    const { backend, persistent } = openBackend(() => null);
    const store = createStore(backend, { persistent });
    store.set('prefs', { locale: 'fr' });
    expect(store.get('prefs')).toEqual({ locale: 'fr' });
    expect(store.persistent).toBe(false);
  });
});

describe('migrations', () => {
  function recorder(log: number[], versions: number[]): Migration[] {
    return versions.map((version) => ({ version, migrate: () => log.push(version) }));
  }

  it('starts a fresh storage at the latest version without running migrations', () => {
    const backend = new MemoryBackend();
    const log: number[] = [];
    expect(runMigrations(backend, recorder(log, [2, 3]))).toBe(3);
    expect(backend.getItem(SCHEMA_KEY)).toBe('3');
    expect(log).toEqual([]);
  });

  it('runs pending migrations in version order', () => {
    const backend = new MemoryBackend();
    backend.setItem(SCHEMA_KEY, '1');
    const log: number[] = [];
    expect(runMigrations(backend, recorder(log, [3, 2]))).toBe(3);
    expect(log).toEqual([2, 3]);
    expect(backend.getItem(SCHEMA_KEY)).toBe('3');
    // Idempotent once up to date.
    runMigrations(backend, recorder(log, [3, 2]));
    expect(log).toEqual([2, 3]);
  });

  it('skips migrations already applied and leaves a newer schema alone', () => {
    const backend = new MemoryBackend();
    backend.setItem(SCHEMA_KEY, '2');
    const log: number[] = [];
    runMigrations(backend, recorder(log, [2, 3]));
    expect(log).toEqual([3]);

    backend.setItem(SCHEMA_KEY, '9');
    expect(runMigrations(backend, recorder(log, [2, 3]))).toBe(9);
    expect(backend.getItem(SCHEMA_KEY)).toBe('9');
  });

  it('migrations can rewrite data', () => {
    const backend = new MemoryBackend();
    backend.setItem(SCHEMA_KEY, '1');
    backend.setItem('ik:v1:prefs', '{"lang":"fr"}');
    runMigrations(backend, [
      {
        version: 2,
        migrate(b: KeyValueBackend) {
          const old = JSON.parse(b.getItem('ik:v1:prefs') || '{}');
          b.setItem('ik:v1:prefs', JSON.stringify({ locale: old.lang }));
        },
      },
    ]);
    expect(backend.getItem('ik:v1:prefs')).toBe('{"locale":"fr"}');
  });

  it('stops at a failing migration and keeps the last good version', () => {
    const backend = new MemoryBackend();
    backend.setItem(SCHEMA_KEY, '1');
    const log: number[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const version = runMigrations(backend, [
      { version: 2, migrate: () => log.push(2) },
      {
        version: 3,
        migrate: () => {
          throw new Error('bad');
        },
      },
      { version: 4, migrate: () => log.push(4) },
    ]);
    error.mockRestore();
    expect(version).toBe(2);
    expect(backend.getItem(SCHEMA_KEY)).toBe('2');
    expect(log).toEqual([2]);
  });

  it('the baseline version is 1', () => {
    expect(latestVersion([])).toBe(1);
  });
});

describe('LRU', () => {
  it('orders evictable entries by last access, oldest first', () => {
    const { store } = setup();
    store.set(keys.file('a'), 'A');
    store.set(keys.file('b'), 'B');
    store.set(keys.autosave('c'), 'C');
    store.set(keys.save('c', '1'), 'named');
    store.set(keys.prefs, {});
    expect(store.get(keys.lru)).toEqual(['file:a', 'file:b', 'save:c:auto']);
    store.get(keys.file('a'));
    expect(store.get(keys.lru)).toEqual(['file:b', 'save:c:auto', 'file:a']);
    store.set(keys.file('b'), 'B2');
    expect(store.get(keys.lru)).toEqual(['save:c:auto', 'file:a', 'file:b']);
    store.remove(keys.file('a'));
    expect(store.get(keys.lru)).toEqual(['save:c:auto', 'file:b']);
  });

  it('does not track missing entries', () => {
    const { store } = setup();
    store.get(keys.file('nope'));
    expect(store.get(keys.lru)).toBeUndefined();
  });
});

describe('eviction under quota', () => {
  const big = (n: number) => new Array(n + 1).join('x');

  function fill(store: ReturnType<typeof setup>['store']) {
    const stale = NOW - STALE_AUTOSAVE_MS - DAY;
    store.set(keys.progress('old1'), { lastPlayed: stale - 10 * DAY });
    store.set(keys.progress('old2'), { lastPlayed: stale });
    store.set(keys.progress('recent'), { lastPlayed: NOW - DAY });
    store.set(keys.autosave('old2'), big(100));
    store.set(keys.autosave('old1'), big(100));
    store.set(keys.autosave('recent'), big(100));
    store.set(keys.autosave('unknown'), big(100));
    store.set(keys.save('old1', 'named'), big(100));
    store.set(keys.file('f1'), big(100));
    store.set(keys.file('f2'), big(100));
    store.set(keys.file('f3'), big(100));
    store.get(keys.file('f1')); // f1 becomes the most recently used file
  }

  it('evicts cached files (LRU) first, then stale autosaves oldest-played first', () => {
    const { backend, store, events } = setup(2000);
    fill(store);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      // One character more than the free space: exactly one ~100-char entry must go.
      const free = 2000 - backend.used() - (PREFIX + 'extra' + i).length - 2;
      events.length = 0;
      store.set('extra' + i, big(free + 1));
      order.push(...events.map((e) => (e.type === 'evicted' ? e.key : e.type)));
      store.remove('extra' + i);
    }
    expect(order).toEqual(['file:f2', 'file:f3', 'file:f1', 'save:old1:auto', 'save:old2:auto']);
  });

  it('never evicts named saves, recent autosaves or autosaves of unknown age: reports full instead', () => {
    const { backend, store, events } = setup(2000);
    fill(store);
    let thrown: unknown;
    try {
      store.set('huge', big(1500));
    } catch (error) {
      thrown = error;
    }
    expect(isStorageFullError(thrown)).toBe(true);
    expect((thrown as { key: string }).key).toBe('huge');
    expect(isStorageFullError(new Error('x'))).toBe(false);
    expect(events[events.length - 1]).toEqual({ type: 'full', key: 'huge' });
    const left = store.keys();
    expect(left).toContain('save:old1:named');
    expect(left).toContain('save:recent:auto');
    expect(left).toContain('save:unknown:auto');
    expect(left).not.toContain('huge');
    expect(left.filter((k) => k.indexOf('file:') === 0)).toEqual([]);
    expect(backend.used()).toBeLessThanOrEqual(2000);
  });

  it('never evicts the entry being written', () => {
    const { store, events } = setup(300);
    store.set(keys.file('a'), big(100));
    expect(() => store.set(keys.file('a'), big(400))).toThrow(/^Storage full/);
    expect(events).toEqual([{ type: 'full', key: 'file:a' }]);
    expect(store.get(keys.file('a'))).toBe(big(100));
  });

  it('writes succeed after eviction and the LRU list stays consistent', () => {
    const { store } = setup(600);
    store.set(keys.file('a'), big(200));
    store.set(keys.file('b'), big(200));
    store.set(keys.file('c'), big(200));
    expect(store.keys()).not.toContain('file:a');
    expect(store.get(keys.file('c'))).toBe(big(200));
    expect(store.get(keys.lru)).toEqual(['file:b', 'file:c']);
  });
});

describe('compression', () => {
  it('round-trips text, including non-ASCII', () => {
    const text = 'Vous êtes dans une forêt sombre. 🌲 ' + new Array(200).join('West of House. ');
    const packed = compressText(text);
    expect(packed).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(packed.length).toBeLessThan(text.length);
    expect(decompressText(packed)).toBe(text);
  });

  it('round-trips binary data larger than one base64 chunk', () => {
    const bytes = new Uint8Array(100000);
    let seed = 7;
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = seed & 0xff;
    }
    expect(decompressBytes(compressBytes(bytes))).toEqual(bytes);
    expect(decompressText(compressText(''))).toBe('');
  });
});

describe('prefs', () => {
  it('defaults to empty and merges patches', () => {
    const { store } = setup();
    expect(getPrefs(store)).toEqual({});
    setPrefs(store, { locale: 'fr' });
    setPrefs(store, { libraryView: 'grid' });
    expect(getPrefs(store)).toEqual({ locale: 'fr', libraryView: 'grid' });
    expect(setPrefs(store, { locale: undefined })).toEqual({ libraryView: 'grid' });
    expect(store.get(keys.prefs)).toEqual({ libraryView: 'grid' });
  });

  it('ignores a corrupt prefs value', () => {
    const { store } = setup();
    store.set(keys.prefs, 'oops');
    expect(getPrefs(store)).toEqual({});
  });
});

describe('usage and reset (Settings)', () => {
  function filled() {
    const { backend, store } = setup();
    backend.setItem(SCHEMA_KEY, '1');
    backend.setItem('ik:v0:old', 'x');
    backend.setItem('ik:probe', '1');
    backend.setItem('someone-else', 'keep me');
    backend.setItem('ikea', 'not ours');
    store.set(keys.prefs, { locale: 'fr' });
    store.set(keys.home, []);
    store.set(keys.progress('g1'), { turns: 3 });
    store.set(keys.autosave('g1'), { data: 'abc' });
    store.set(keys.save('g1', '1'), { data: 'abcd' });
    store.set(keys.save('g1', '2'), { data: 'abcdef' });
    store.set(keys.file('g1'), 'zzzz', { cache: true });
    return { backend, store };
  }

  function size(backend: MemoryBackend, key: string) {
    return key.length + backend.getItem(key)!.length;
  }

  it('sums keys and values per group, ignoring keys outside ik:', () => {
    const { backend, store } = filled();
    const usage = store.usage();
    expect(usage.saves).toEqual({
      count: 2,
      size: size(backend, 'ik:v1:save:g1:1') + size(backend, 'ik:v1:save:g1:2'),
    });
    expect(usage.autosaves).toEqual({ count: 1, size: size(backend, 'ik:v1:save:g1:auto') });
    expect(usage.files).toEqual({ count: 1, size: size(backend, 'ik:v1:file:g1') });
    // prefs, home, progress, lru, schema, the old version's key and the probe key.
    expect(usage.other.count).toBe(7);
    expect(usage.total).toBe(
      backend.used() - size(backend, 'someone-else') - size(backend, 'ikea'),
    );
    expect(usage.total).toBe(
      usage.saves.size + usage.autosaves.size + usage.files.size + usage.other.size,
    );
  });

  it('is empty for an empty storage', () => {
    const { store } = setup();
    expect(store.usage().total).toBe(0);
    expect(store.usage().saves.count).toBe(0);
  });

  it('reset removes every ik: key, of any version, and nothing else', () => {
    const { backend, store } = filled();
    store.clearAll();
    const left: string[] = [];
    for (let i = 0; i < backend.length; i++) left.push(backend.key(i)!);
    expect(left.sort()).toEqual(['ikea', 'someone-else']);
    expect(backend.getItem('someone-else')).toBe('keep me');
    expect(store.keys()).toEqual([]);
    expect(getPrefs(store)).toEqual({});
    expect(store.usage().total).toBe(0);
  });

  it('a reset storage migrates like a fresh one', () => {
    const { backend, store } = filled();
    store.clearAll();
    expect(runMigrations(backend)).toBe(latestVersion(MIGRATIONS));
    expect(backend.getItem(SCHEMA_KEY)).toBe(String(latestVersion(MIGRATIONS)));
  });
});
