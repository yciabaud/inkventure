import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyse, FONT_RANGES, inFonts, laidOut, type Recorded } from './detect';

const at = (step: string, update: Recorded['update']): Recorded => ({ step: step, update: update });
const kinds = (records: Recorded[]) => analyse(records).list.map((f) => f.kind);

describe('rendering survey detectors (S7.3)', () => {
  it('finds nothing in an ordinary game: a status line, a buffer window, plain text', () => {
    const records = [
      at('intro', {
        windows: [
          { id: 1, type: 'grid', gridwidth: 80, gridheight: 1 },
          { id: 2, type: 'buffer' },
        ],
        content: [
          { id: 1, lines: [{ line: 0, content: ['normal', ' Outside            Score: 0 '] }] },
          {
            id: 2,
            text: [
              { content: ['subheader', 'Outside'] },
              { content: ['normal', 'A field. “Hello” — café…'] },
            ],
          },
        ],
        input: [{ id: 2, type: 'line' }],
      }),
    ];
    expect(kinds(records)).toEqual([]);
  });

  it('flags rows of the upper window in different styles (a selection in reverse video)', () => {
    const records = [
      at('help', {
        content: [
          {
            id: 1,
            lines: [
              { line: 0, content: ['normal', '  Contents'] },
              { line: 1, content: ['user1', '  Hints'] },
            ],
          },
        ],
      }),
    ];
    expect(analyse(records).list).toEqual([
      { kind: 'grid-styles', step: 'help', detail: 'normal, user1' },
    ]);
  });

  it('flags two grid windows, two buffer windows and a graphics window', () => {
    const records = [
      at('look', {
        windows: [
          { id: 1, type: 'grid' },
          { id: 2, type: 'grid' },
          { id: 3, type: 'buffer' },
          { id: 4, type: 'buffer' },
          { id: 5, type: 'graphics' },
        ],
      }),
    ];
    const found = analyse(records).list;
    expect(found.map((f) => f.kind)).toEqual(['windows', 'graphics']);
    expect(found[0].detail).toBe('2 grid windows');
  });

  it('flags drawing in a graphics window, a timer and hyperlinks', () => {
    const records = [
      at('intro', { content: [{ id: 5, draw: [{ special: 'fill' }] }], timer: 500 }),
      at('look', {
        content: [
          { id: 2, text: [{ content: [{ style: 'normal', text: 'north', hyperlink: 3 }] }] },
        ],
        input: [{ id: 2, type: 'line', hyperlink: true }],
      }),
    ];
    expect(analyse(records).list).toEqual([
      { kind: 'timer', step: 'intro', detail: '500 ms' },
      { kind: 'graphics', step: 'intro', detail: 'draws in a graphics window' },
      { kind: 'hyperlinks', step: 'look', detail: 'hyperlink input requested' },
    ]);
  });

  it('lists characters outside the bundled fonts once, from where they first show', () => {
    const records = [
      at('intro', { content: [{ id: 2, text: [{ content: ['normal', 'Café — fine.'] }] }] }),
      at('look', { content: [{ id: 2, text: [{ content: ['normal', '┌──┐ → ★ ┌'] }] }] }),
    ];
    expect(analyse(records).list).toEqual([
      { kind: 'glyphs', step: 'look', detail: '┌ U+250C, ─ U+2500, ┐ U+2510, → U+2192, ★ U+2605' },
    ]);
  });

  it('flags fixed-width lines laid out in columns and wider than the screen, keeping the widest', () => {
    const map = '+----+    +----+    +----+    +----+    +----+';
    const table = 'Lamp ........... 3    Oil ........... 2    Rope .. 1';
    const press = "[Press 'R' to restore; any other key to begin.]";
    const records = [
      at('intro', { content: [{ id: 2, text: [{ content: ['preformatted', '+--+  +--+'] }] }] }),
      at('intro', { content: [{ id: 2, text: [{ content: ['preformatted', press] }] }] }),
      at('look', { content: [{ id: 2, text: [{ content: ['preformatted', map] }] }] }),
      at('score', { content: [{ id: 2, text: [{ content: ['preformatted', table + '   '] }] }] }),
    ];
    expect(analyse(records).list).toEqual([
      {
        kind: 'wide-fixed',
        step: 'look',
        detail: table.length + ' characters: "' + table.slice(0, 40) + '"',
      },
    ]);
  });

  it('knows a line laid out in columns from prose in a fixed font', () => {
    expect(laidOut('That you disclose the secret that I shall tell you, on your oath.')).toBe(
      false,
    );
    expect(laidOut('North      South')).toBe(true);
    expect(laidOut('|  |__|  |=====|')).toBe(true);
  });

  it('knows the latin subset of the bundled fonts, as their CSS declares it', () => {
    expect(inFonts('é'.charCodeAt(0))).toBe(true);
    expect(inFonts(0x2014)).toBe(true);
    expect(inFonts(0x2192)).toBe(false);
    const css = readFileSync('node_modules/@fontsource/literata/400.css', 'utf8');
    const latin = /literata-latin-400-normal[\s\S]*?unicode-range: ([^;]+);/.exec(css);
    expect(latin).not.toBeNull();
    const ranges = latin![1].split(',').map((part) => {
      const [from, to] = part.trim().replace('U+', '').split('-');
      return [parseInt(from, 16), parseInt(to || from, 16)];
    });
    expect(ranges).toEqual(FONT_RANGES);
  });
});
