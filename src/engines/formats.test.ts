import { describe, expect, it } from 'vitest';
import { engineFor, isAvailable, loadEngine, looksLikeStory } from './formats';

function header(bytes: number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(bytes);
  return out;
}

function ascii(text: string): number[] {
  return text.split('').map((c) => c.charCodeAt(0));
}

describe('format → engine', () => {
  it('maps every catalogue format to its engine', () => {
    expect(engineFor('zcode')).toBe('zmachine');
    expect(engineFor('glulx')).toBe('glulx');
    expect(engineFor('ink')).toBe('ink');
    expect(engineFor('twine')).toBe('twine');
    expect(engineFor('tads')).toBeNull();
    expect(engineFor('toString')).toBeNull();
  });

  it('plays every format: Z-machine, Glulx and ink engines, Twine in its own frame', async () => {
    expect(isAvailable('zmachine')).toBe(true);
    expect(isAvailable('glulx')).toBe(true);
    expect(isAvailable('ink')).toBe(true);
    expect(isAvailable('twine')).toBe(true);
    expect(typeof (await loadEngine('zmachine'))).toBe('function');
    expect(typeof (await loadEngine('glulx'))).toBe('function');
    expect(typeof (await loadEngine('ink'))).toBe('function');
    // Twine stories have no `Engine`: the reader runs them in a sandboxed frame.
    await expect(loadEngine('twine')).rejects.toThrow(/No engine/);
  });

  it('recognises story files by their header', () => {
    const blorb = header(ascii('FORM\0\0\0\x10IFRS'), 64);
    const aiff = header(ascii('FORM\0\0\0\x10AIFF'), 64);
    expect(looksLikeStory('zmachine', header([5], 64))).toBe(true);
    expect(looksLikeStory('zmachine', header([3], 64))).toBe(true);
    expect(looksLikeStory('zmachine', blorb)).toBe(true);
    expect(looksLikeStory('zmachine', aiff)).toBe(false);
    expect(looksLikeStory('zmachine', header([0], 64))).toBe(false);
    expect(looksLikeStory('zmachine', header(ascii('<!DOCTYPE html>'), 64))).toBe(false);
    expect(looksLikeStory('zmachine', header([5], 10))).toBe(false);
    expect(looksLikeStory('glulx', header(ascii('Glul'), 64))).toBe(true);
    expect(looksLikeStory('glulx', header([5], 64))).toBe(false);
    expect(looksLikeStory('ink', header(ascii('{"inkVersion"'), 20))).toBe(true);
  });

  it('recognises a Twine story by its story data (Twine 2) or store area (Twine 1)', () => {
    const page = (body: string) => new Uint8Array(ascii('<!DOCTYPE html><html><body>' + body));
    expect(looksLikeStory('twine', page('<tw-storydata name="x" hidden></tw-storydata>'))).toBe(
      true,
    );
    expect(looksLikeStory('twine', page('<div id="storeArea" hidden></div>'))).toBe(true);
    expect(looksLikeStory('twine', page('<h1>404 Not Found</h1>'))).toBe(false);
    expect(looksLikeStory('twine', header([5], 64))).toBe(false);
  });
});
