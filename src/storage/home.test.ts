import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import { addToHome, getHome, isInHome, removeFromHome } from './home';
import { keys } from './keys';
import { createStore, isStorageFullError } from './store';

const lamp = { tuid: 'lamp', title: 'The Lamp', author: 'Someone' };
const cave = { tuid: 'cave', title: 'Cave', author: 'Other' };

describe('My adventures (ik:v1:home)', () => {
  it('adds games at the top, once, and removes them', () => {
    const store = createStore(new MemoryBackend());
    expect(getHome(store)).toEqual([]);
    addToHome(store, lamp, 1000);
    addToHome(store, cave, 2000);
    addToHome(store, lamp, 3000);
    expect(getHome(store)).toEqual([
      { tuid: 'cave', title: 'Cave', author: 'Other', added: 2000 },
      { tuid: 'lamp', title: 'The Lamp', author: 'Someone', added: 1000 },
    ]);
    expect(isInHome(store, 'lamp')).toBe(true);

    removeFromHome(store, 'lamp');
    expect(isInHome(store, 'lamp')).toBe(false);
    expect(getHome(store).map((e) => e.tuid)).toEqual(['cave']);
    removeFromHome(store, 'missing');
    expect(getHome(store).map((e) => e.tuid)).toEqual(['cave']);
  });

  it('persists in the backend', () => {
    const backend = new MemoryBackend();
    addToHome(createStore(backend), lamp, 1000);
    expect(isInHome(createStore(backend), 'lamp')).toBe(true);
  });

  it('keeps the saves when a game is removed', () => {
    const store = createStore(new MemoryBackend());
    addToHome(store, lamp, 1000);
    store.set(keys.save('lamp', '1'), { v: 1 });
    removeFromHome(store, 'lamp');
    expect(store.get(keys.save('lamp', '1'))).toEqual({ v: 1 });
  });

  it('ignores a malformed record', () => {
    const store = createStore(new MemoryBackend());
    store.set(keys.home, { not: 'a list' });
    expect(getHome(store)).toEqual([]);
    store.set(keys.home, [null, { tuid: 'lamp', title: 'x', author: '', added: 1 }]);
    expect(getHome(store).map((e) => e.tuid)).toEqual(['lamp']);
  });

  it('throws a storage-full error when nothing can be evicted', () => {
    const store = createStore(new MemoryBackend(10));
    let error: unknown;
    try {
      addToHome(store, lamp, 1000);
    } catch (e) {
      error = e;
    }
    expect(isStorageFullError(error)).toBe(true);
  });
});
