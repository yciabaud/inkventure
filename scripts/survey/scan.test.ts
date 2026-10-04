// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executable, formatOf } from './blorb';
import { features, libraryOf, storyFacts, type StoryFacts } from './features';
import { constant, decodeGlulx, scanGlulx } from './glulx';
import { replayList, scanReport, type ScanResult } from './scan-report';
import { decode, disassemble, unpackRoutine } from './zcode';

const file = (path: string) => new Uint8Array(readFileSync(path));
const LAMP_Z = file('tests/fixtures/zmachine/lamp.z5');
const CLOCK_Z = file('tests/fixtures/zmachine/clock.z5');
const LAMP_G = file('tests/fixtures/glulx/lamp.ulx');
const MEDIA_G = file('tests/fixtures/glulx/media.ulx');
const PICTURE_G = file('tests/fixtures/glulx/picture.gblorb');
const NO_LIBRARY = { units: new Set<number>(), glyphs: new Set<number>() };

describe('Z-machine disassembler (S7.4)', () => {
  it('decodes instructions: forms, operands, stores, branches, inline text', () => {
    // je small small ?(branch): long form 2OP:1, then the branch byte.
    expect(decode(new Uint8Array([0x01, 0x05, 0x06, 0xc5]), 0, 5)).toMatchObject({
      form: '2OP',
      op: 1,
      operands: [
        { type: 'small', value: 5 },
        { type: 'small', value: 6 },
      ],
      next: 4,
      branch: 7,
    });
    // print "…": 0OP:2 and its text, up to the word with the top bit set.
    expect(decode(new Uint8Array([0xb2, 0x11, 0x22, 0x94, 0xa5]), 0, 5)).toMatchObject({
      form: '0OP',
      op: 2,
      next: 5,
    });
    // An opcode the version does not have, or the wrong number of operands, is refused.
    expect(() => decode(new Uint8Array([0xbf]), 0, 3)).toThrow();
    expect(() => decode(new Uint8Array([0xea, 0x0f, 0x01, 0x02]), 0, 5)).toThrow();
  });

  it('finds every routine of the fixtures: each constant call names one it decoded', () => {
    for (const story of [LAMP_Z, CLOCK_Z]) {
      const d = disassemble(story);
      expect(d.version).toBe(5);
      expect(d.routines.size).toBeGreaterThan(300);
      const header = new DataView(story.buffer, story.byteOffset, story.byteLength);
      for (const code of d.routines.values()) {
        for (const i of code) {
          if (
            i.form === 'VAR' &&
            i.op === 0 &&
            i.operands[0].type === 'large' &&
            i.operands[0].value
          ) {
            expect(d.routines.has(unpackRoutine(i.operands[0].value, 5, header))).toBe(true);
          }
        }
      }
    }
  });
});

describe('Glulx reader (S7.4)', () => {
  it('decodes an instruction and its addressing modes', () => {
    // copy 203 → push: opcode 0x40, modes (1: 1-byte constant, 8: stack), the constant.
    expect(decodeGlulx(new Uint8Array([0x40, 0x81, 0xcb]), 0)).toMatchObject({
      op: 0x40,
      operands: [
        { mode: 1, value: -53 },
        { mode: 8, value: 0 },
      ],
      next: 3,
    });
    expect(() => decodeGlulx(new Uint8Array([0x7f, 0x00]), 0)).toThrow();
  });

  it('reads the functions of the fixture and its Glk calls, and the characters of its strings', () => {
    const scan = scanGlulx(LAMP_G);
    expect(scan.functions.size).toBeGreaterThan(300);
    const selectors = new Set<number>();
    for (const code of scan.functions.values()) {
      for (const ins of code)
        if (ins.op === 0x130 && constant(ins.operands[0]) !== null)
          selectors.add(constant(ins.operands[0])!);
    }
    // glk_window_open, glk_put_char, glk_select.
    expect([0x23, 0x80, 0xc0].every((s) => selectors.has(s))).toBe(true);
    for (const c of 'Saltmere') expect(scan.chars.has(c.charCodeAt(0))).toBe(true);
  });

  it('takes the story out of a Blorb file', () => {
    expect(formatOf(executable(PICTURE_G))).toBe('glulx');
    expect(executable(LAMP_Z)).toBe(LAMP_Z);
  });
});

describe('display features (S7.4)', () => {
  it('Z-machine: the fixture quote box, its own drawing in the upper window, no timer or colour', () => {
    const counts = features(storyFacts(LAMP_Z), NO_LIBRARY);
    expect(counts['quote-box']).toBe(1);
    expect(counts['upper-window']).toBeGreaterThan(0);
    expect(counts.colour).toBeUndefined();
    expect(counts['version-6']).toBeUndefined();
  });

  it('Glulx: the quote box, the graphics and buffer windows, pictures and sound of the fixtures', () => {
    expect(features(storyFacts(LAMP_G), NO_LIBRARY)['quote-box']).toBe(1);
    const media = features(storyFacts(MEDIA_G), NO_LIBRARY);
    expect(media['graphics-window']).toBe(1);
    expect(media.images).toBeGreaterThan(0);
    expect(media.sound).toBeGreaterThan(0);
    expect(features(storyFacts(PICTURE_G), NO_LIBRARY).images).toBeGreaterThan(0);
  });

  it("tells the libraries' routines from the game's by how many games have them", () => {
    const game = (hashes: number[], glyphs: number[] = []): StoryFacts => ({
      format: 'zmachine',
      version: 5,
      size: 10,
      units: hashes.map((h) => ({ hash: h, counts: { 'upper-window': 1 } })),
      counts: {},
      glyphs: glyphs,
    });
    // Routine 1 and "→" are in every game (the library's); routine 2 in one game (its own).
    const all = [game([1], [0x2192]), game([1], [0x2192]), game([1, 2], [0x2192, 0x2605])];
    const library = libraryOf(all);
    expect(library.units.has(1)).toBe(true);
    expect(library.units.has(2)).toBe(false);
    expect(features(all[0], library)).toEqual({});
    expect(features(all[2], library)).toEqual({ 'upper-window': 1, unicode: 1 });
  });
});

describe('scan report (S7.4)', () => {
  const result = (
    title: string,
    ratings: number,
    counts: ScanResult['counts'],
    glyphs: number[] = [],
  ): ScanResult => ({
    tuid: title.toLowerCase(),
    title: title,
    format: 'zcode',
    ratings: ratings,
    featured: false,
    counts: counts,
    glyphs: glyphs,
  });
  const results = [
    result('Curses', 300, { 'quote-box': 4, colour: 1 }),
    result('Jigsaw', 200, { 'quote-box': 2 }),
    result('Maps', 50, { unicode: 1 }, [0x2500]),
    { ...result('Gone', 10, {}), error: 'HTTP 404' },
  ];

  it('ranks the features by number of games and lists the games to replay', () => {
    const text = scanReport(results, '2026-10-04');
    expect(text).toContain('| Quote boxes | 2 |');
    expect(text.indexOf('| Quote boxes |')).toBeLessThan(text.indexOf('| Colours |'));
    expect(text).toContain('npm run survey:rendering -- --only curses,jigsaw');
    expect(text).toContain('─ U+2500 (1)');
    expect(text).toContain('- Gone (zcode): HTTP 404');
    expect(text).toContain('| Curses | zcode | Quote boxes 4; Colours 1 |');
  });

  it('replays the most-rated games of the features worth a look only', () => {
    expect(replayList(results)).toEqual(['curses', 'jigsaw']);
  });
});
