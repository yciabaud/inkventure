import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relocateDdb, toJddb } from './relocate';

/** The bytes of a .jddb (DDBDATA), without DRC's offset comments. */
function jddbBytes(source: string): Uint8Array {
  const numbers = source.replace(/\/\/.*$/gm, '').match(/0x[0-9a-f]+/gi) || [];
  return Uint8Array.from(numbers.map(Number));
}

// The probe's game built by DRC for its HTML target (what jDAAD reads), and for two other machines.
const html = jddbBytes(readFileSync('public/probe/daad/lamp-room.jddb', 'utf8'));
const st = readFileSync('tests/fixtures/daad/lamp-room-st.ddb');
const zx = readFileSync('tests/fixtures/daad/lamp-room-zx48k-v2.ddb');

describe('relocateDdb', () => {
  it('turns the Atari ST database (big-endian) into the HTML one, but for the machine byte', () => {
    const { ddb, pointers } = relocateDdb(st, 0, true);
    expect(pointers).toBe(155);
    // DRC's .jddb ends with one more 0 (it reads past the end of the file).
    expect(html.length).toBe(ddb.length + 1);
    const differ = [...ddb.keys()].filter((i) => ddb[i] !== html[i]);
    expect(differ).toEqual([1]);
    expect(ddb[1] >> 4).toBe(0x5); // ST
    expect(html[1] >> 4).toBe(0xd); // HTML (PC VGA 256)
  });

  it('moves a Spectrum database (classic v2, loaded at 0x8400) to 0', () => {
    expect(zx[0]).toBe(2);
    expect(zx[1] >> 4).toBe(0x1);
    const { ddb, pointers } = relocateDdb(zx, 0x8400);
    expect(pointers).toBe(155);
    const word = (at: number) => ddb[at] + ddb[at + 1] * 256;
    // The header's pointers now fall inside the file, the file length matches it.
    for (let i = 0; i < 12; i++) expect(word(8 + i * 2)).toBeLessThan(ddb.length);
    expect(word(32)).toBe(ddb.length);
    // Each text table (objects, locations, messages, system messages) points inside the file, in order. (That the
    // game plays from it is the e2e test's: tests/e2e/probe-daad.spec.ts.)
    const counts = [ddb[3], ddb[4], ddb[5], ddb[6]];
    counts.forEach((count, t) => {
      const start = word(12 + t * 2);
      const texts = Array.from({ length: count }, (_, i) => word(start + i * 2));
      expect(texts.every((at) => at > 0 && at < ddb.length)).toBe(true);
      expect([...texts].sort((a, b) => a - b)).toEqual(texts);
    });
  });

  it('leaves a database already at 0 and little-endian as it is', () => {
    const ddb = html.slice(0, html.length - 1);
    expect(relocateDdb(ddb, 0).ddb).toEqual(ddb);
  });

  it('fails on a pointer outside the file (wrong base address)', () => {
    expect(() => relocateDdb(zx, 0)).toThrow(/outside a 3396-byte DDB loaded at 0/);
  });
});

describe('toJddb', () => {
  it('writes DDBDATA as jDAAD loads it', () => {
    expect(toJddb(Uint8Array.from([3, 0xd0, 0x5f]))).toBe('var DDBDATA = [0x3,0xd0,0x5f];\n');
  });
});
