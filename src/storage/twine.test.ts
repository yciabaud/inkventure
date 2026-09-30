import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend';
import { removeFromHome } from './home';
import { keys } from './keys';
import { createStore } from './store';
import { readTwineStorage, toItems, TWINE_MAX_CHARS, writeTwineStorage } from './twine';

function store() {
  return createStore(new MemoryBackend());
}

describe("a Twine story's storage", () => {
  it('is empty until saved, then read back', () => {
    const s = store();
    expect(readTwineStorage(s, 'tw')).toEqual({ local: {}, session: {} });
    expect(
      writeTwineStorage(s, 'tw', { local: { 'save.1': 'abc' }, session: { state: 'x' } }, 5),
    ).toBe(true);
    expect(readTwineStorage(s, 'tw')).toEqual({
      local: { 'save.1': 'abc' },
      session: { state: 'x' },
    });
    expect(s.get(keys.twine('tw'))).toMatchObject({ v: 1, date: 5 });
  });

  it('keeps only string items, and ignores a record it does not know', () => {
    expect(toItems({ a: 'x', b: 2, c: null })).toEqual({ a: 'x' });
    expect(toItems(['x'])).toEqual({});
    expect(toItems('x')).toEqual({});
    const s = store();
    s.set(keys.twine('tw'), { v: 2, local: { a: 'x' } });
    expect(readTwineStorage(s, 'tw')).toEqual({ local: {}, session: {} });
  });

  it('refuses a story storing more than its limit, keeping the previous record', () => {
    const s = store();
    writeTwineStorage(s, 'tw', { local: { a: 'x' }, session: {} }, 1);
    const huge = { big: new Array(TWINE_MAX_CHARS).join('x') + 'xx' };
    expect(writeTwineStorage(s, 'tw', { local: huge, session: {} }, 2)).toBe(false);
    expect(readTwineStorage(s, 'tw').local).toEqual({ a: 'x' });
  });

  it('counts as a save: kept by usage as a save, removed with the game saves', () => {
    const s = store();
    writeTwineStorage(s, 'tw', { local: { a: 'x' }, session: {} }, 1);
    expect(s.usage().saves.count).toBe(1);
    removeFromHome(s, 'tw', { deleteSaves: true });
    expect(s.get(keys.twine('tw'))).toBeUndefined();
  });
});
