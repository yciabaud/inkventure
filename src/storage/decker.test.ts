import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import { clearDeckerSave, DECKER_MAX_CHARS, readDeckerSave, writeDeckerSave } from './decker';
import { removeFromHome } from './home';
import { keys } from './keys';
import { createStore } from './store';

function store() {
  return createStore(new MemoryBackend());
}

const DECK = '{deck}\nversion:1\ncard:"Widgets"\n';

describe("a Decker deck's save", () => {
  it('is none until saved, then read back; Restart clears it', () => {
    const s = store();
    expect(readDeckerSave(s, 'dk')).toBeNull();
    expect(writeDeckerSave(s, 'dk', DECK, 5)).toBe(true);
    expect(readDeckerSave(s, 'dk')).toBe(DECK);
    expect(s.get(keys.decker('dk'))).toMatchObject({ v: 1, date: 5 });
    clearDeckerSave(s, 'dk');
    expect(readDeckerSave(s, 'dk')).toBeNull();
  });

  it('ignores a record it does not know', () => {
    const s = store();
    s.set(keys.decker('dk'), { v: 2, deck: DECK });
    expect(readDeckerSave(s, 'dk')).toBeNull();
  });

  it('refuses a deck over its limit, keeping the previous save', () => {
    const s = store();
    writeDeckerSave(s, 'dk', DECK, 1);
    expect(writeDeckerSave(s, 'dk', DECK + 'x'.repeat(DECKER_MAX_CHARS), 2)).toBe(false);
    expect(readDeckerSave(s, 'dk')).toBe(DECK);
  });

  it('counts as a save: removed with the game saves', () => {
    const s = store();
    writeDeckerSave(s, 'dk', DECK, 1);
    expect(s.usage().saves.count).toBe(1);
    removeFromHome(s, 'dk', { deleteSaves: true });
    expect(s.get(keys.decker('dk'))).toBeUndefined();
  });
});
