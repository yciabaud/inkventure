// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import { keys, PREFIX } from './keys';
import { writeAutosave, writeSlot, updateProgress, readAutosave, type GameSnapshot } from './saves';
import { createStore, isStorageFullError } from './store';
import {
  applyImport,
  collectBackup,
  contentsOf,
  crc32,
  decodeBackup,
  encodeBackup,
  FORMAT_VERSION,
  localEntries,
  planImport,
  type Backup,
} from './transfer';

function fake(turn: number, size = 64): GameSnapshot {
  return {
    state: new Uint8Array(size).fill(turn),
    turn,
    paragraphs: [[{ text: 'Turn ' + turn + ' — café', style: 'normal' }]],
    status: ['Somewhere'],
  };
}

function filled() {
  const backend = new MemoryBackend();
  const store = createStore(backend);
  store.set(keys.prefs, { locale: 'fr', reader: { size: 3 } });
  store.set(keys.home, [
    { tuid: 'lamp', title: 'The Lamp', author: 'A', added: 20 },
    { tuid: 'dune', title: 'Dune', author: 'B', added: 10, cover: true },
  ]);
  updateProgress(store, 'lamp', { turns: 3, lastPlayed: 300, location: 'Lamp Room' });
  writeAutosave(store, 'lamp', fake(3), 300);
  writeSlot(store, 'lamp', 2, 'Tower', fake(2), 200);
  store.set(keys.file('lamp'), { url: 'x', data: 'big' });
  return { backend, store };
}

function encoded(backup: Backup) {
  return encodeBackup(backup);
}

describe('export code', () => {
  it('round-trips prefs, home, progress and saves but not cached files', () => {
    const { store } = filled();
    const backup = collectBackup(store, 1234);
    expect(Object.keys(backup.entries).sort()).toEqual([
      'home',
      'prefs',
      'progress:lamp',
      'save:lamp:2',
      'save:lamp:auto',
    ]);
    const code = encoded(backup);
    expect(code.split('\n')[0]).toMatch(
      new RegExp('^INKVENTURE ' + FORMAT_VERSION + ' [0-9a-f]{8}$'),
    );
    // Readable groups of 8 characters.
    expect(code.split('\n')[1]).toMatch(/^(\S{8} ){5}\S{8}$/);

    const decoded = decodeBackup(code);
    expect(decoded).toEqual({ ok: true, backup: backup });

    const target = createStore(new MemoryBackend());
    applyImport(target, (decoded as { backup: Backup }).backup, 'overwrite');
    expect(localEntries(target)).toEqual(localEntries(store));
    expect(readAutosave(target, 'lamp')!.state).toEqual(fake(3).state);
    expect(target.get(keys.file('lamp'))).toBeUndefined();
  });

  it('accepts a code with its spacing and line breaks mangled by a paste', () => {
    const { store } = filled();
    const code = encoded(collectBackup(store, 1));
    const mangled = '  \n' + code.replace(/\n/g, ' ').replace(/ /g, '  \r\n ') + '\n';
    expect(decodeBackup(mangled).ok).toBe(true);
  });

  it('rejects a damaged or incomplete code (checksum)', () => {
    const { store } = filled();
    const code = encoded(collectBackup(store, 1));
    const lines = code.split('\n');
    const body = lines[2];
    const flipped = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    const damaged = [lines[0], lines[1], flipped].concat(lines.slice(3)).join('\n');
    expect(decodeBackup(damaged)).toEqual({ ok: false, error: 'checksum' });
    expect(decodeBackup(lines.slice(0, 2).join('\n'))).toEqual({ ok: false, error: 'checksum' });
    expect(decodeBackup(code + ' !!')).toEqual({ ok: false, error: 'checksum' });
  });

  it('rejects empty text, other text and codes of a newer version', () => {
    expect(decodeBackup('')).toEqual({ ok: false, error: 'empty' });
    expect(decodeBackup('  \n ')).toEqual({ ok: false, error: 'empty' });
    expect(decodeBackup('hello world')).toEqual({ ok: false, error: 'format' });
    const code = encoded({ schema: 1, date: 1, entries: {} });
    expect(decodeBackup(code.replace('INKVENTURE 1', 'INKVENTURE 2'))).toEqual({
      ok: false,
      error: 'newer',
    });
    expect(decodeBackup(code.replace('INKVENTURE 1', 'INKVENTURE 0'))).toEqual({
      ok: false,
      error: 'format',
    });
    expect(decodeBackup(encoded({ schema: 99, date: 1, entries: {} }))).toEqual({
      ok: false,
      error: 'newer',
    });
  });

  it('drops entries a code may not carry or with the wrong shape', () => {
    const code = encoded({
      schema: 1,
      date: 1,
      entries: {
        'file:lamp': { data: 'x' },
        lru: ['a'],
        home: 'not a list',
        'save:lamp:1': { data: 1 },
        'progress:lamp': { turns: 1, lastPlayed: 1 },
      },
    });
    const decoded = decodeBackup(code);
    expect(decoded.ok && decoded.backup.entries).toEqual({
      'progress:lamp': { turns: 1, lastPlayed: 1 },
    });
  });

  it('computes a standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('summarises what a code holds', () => {
    const { store } = filled();
    expect(contentsOf(localEntries(store))).toEqual({
      settings: true,
      adventures: 2,
      saves: 1,
      autosaves: 1,
    });
    expect(contentsOf({})).toEqual({ settings: false, adventures: 0, saves: 0, autosaves: 0 });
  });
});

describe('merge vs overwrite', () => {
  const slot = (date: number, name = 'S') => ({ v: 1, name, date, turn: 1, data: 'd', text: 't' });

  const local = {
    prefs: { locale: 'fr', libraryView: 'grid' },
    home: [
      { tuid: 'a', title: 'A', author: '', added: 30 },
      { tuid: 'b', title: 'B here', author: '', added: 10 },
    ],
    'progress:a': { turns: 5, lastPlayed: 500 },
    'progress:b': { turns: 1, lastPlayed: 100 },
    'save:a:auto': slot(500),
    'save:b:auto': slot(100),
    'save:a:1': slot(400, 'mine'),
    'save:a:2': slot(50, 'old'),
  };
  const incoming = {
    prefs: { locale: 'en', reader: { size: 2 } },
    home: [
      { tuid: 'c', title: 'C', author: '', added: 20 },
      { tuid: 'b', title: 'B there', author: '', added: 5 },
    ],
    'progress:a': { turns: 2, lastPlayed: 200 },
    'progress:b': { turns: 9, lastPlayed: 900 },
    'progress:c': { turns: 1, lastPlayed: 50 },
    'save:a:auto': slot(200),
    'save:b:auto': slot(900),
    'save:a:1': slot(400, 'same date'),
    'save:a:2': slot(60, 'newer'),
    'save:c:3': slot(50, 'new'),
  };

  it('merge keeps local settings, unions My adventures and keeps the newer record', () => {
    const plan = planImport(local, incoming, 'merge');
    expect(plan.removes).toEqual([]);
    expect(plan.writes).toEqual({
      prefs: { locale: 'fr', libraryView: 'grid', reader: { size: 2 } },
      home: [
        { tuid: 'a', title: 'A', author: '', added: 30 },
        { tuid: 'c', title: 'C', author: '', added: 20 },
        { tuid: 'b', title: 'B here', author: '', added: 10 },
      ],
      'progress:b': { turns: 9, lastPlayed: 900 },
      'progress:c': { turns: 1, lastPlayed: 50 },
      'save:b:auto': slot(900),
      'save:a:2': slot(60, 'newer'),
      'save:c:3': slot(50, 'new'),
    });
    // Slot 2 is replaced by the newer one; slot 1 (same date) stays.
    expect(plan.replacedSaves).toBe(1);
  });

  it('overwrite makes this device exactly the code', () => {
    const plan = planImport(local, incoming, 'overwrite');
    expect(plan.removes).toEqual([]);
    expect(Object.keys(plan.writes).sort()).toEqual(Object.keys(incoming).sort());
    expect(plan.replacedSaves).toBe(2);

    const fewer = planImport(local, { home: [] }, 'overwrite');
    expect(fewer.removes.sort()).toEqual(
      Object.keys(local)
        .filter((k) => k !== 'home')
        .sort(),
    );
    expect(fewer.replacedSaves).toBe(2);
  });

  it('merging a code into itself changes nothing', () => {
    expect(planImport(local, local, 'merge')).toEqual({
      writes: {},
      removes: [],
      replacedSaves: 0,
    });
    expect(planImport(local, local, 'overwrite')).toEqual({
      writes: {},
      removes: [],
      replacedSaves: 0,
    });
  });

  it('applies merge and overwrite to a store, keeping cached files', () => {
    const { store } = filled();
    const other = createStore(new MemoryBackend());
    other.set(keys.home, [{ tuid: 'zork', title: 'Zork', author: 'C', added: 99 }]);
    writeSlot(other, 'zork', 1, 'Mailbox', fake(1), 50);
    const backup = collectBackup(other, 1);

    applyImport(store, backup, 'merge');
    expect(store.get<Array<{ tuid: string }>>(keys.home)!.map((e) => e.tuid)).toEqual([
      'zork',
      'lamp',
      'dune',
    ]);
    expect(store.get(keys.save('zork', '1'))).toBeDefined();
    expect(store.get(keys.save('lamp', '2'))).toBeDefined();

    applyImport(store, backup, 'overwrite');
    expect(localEntries(store)).toEqual(backup.entries);
    expect(store.get(keys.file('lamp'))).toBeDefined();
  });

  it('changes nothing when the storage fills up half-way', () => {
    const source = createStore(new MemoryBackend());
    // Random bytes: they do not compress.
    let seed = 7;
    const noise = () => {
      const bytes = new Uint8Array(3000);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (seed = (seed * 16807) % 2147483647) & 0xff;
      return bytes;
    };
    for (let i = 1; i <= 5; i++) {
      writeSlot(source, 'big', i, 'Save ' + i, { ...fake(i), state: noise() }, i);
    }
    const backup = collectBackup(source, 1);

    const { backend, store } = filled();
    const before = localEntries(store);
    // Room for a couple of the big slots (about 4,000 characters each), not all five; no cached file to evict.
    const limited = new MemoryBackend(backend.used() + 10000);
    for (let i = 0; i < backend.length; i++) {
      const key = backend.key(i)!;
      if (key.indexOf(PREFIX + 'file:') !== 0) limited.setItem(key, backend.getItem(key)!);
    }
    const target = createStore(limited);
    let thrown: unknown;
    try {
      applyImport(target, backup, 'merge');
    } catch (error) {
      thrown = error;
    }
    expect(isStorageFullError(thrown)).toBe(true);
    expect(localEntries(target)).toEqual(before);
    expect(target.get(keys.save('big', '1'))).toBeUndefined();
  });
});
