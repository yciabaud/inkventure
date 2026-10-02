import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OutputBlock, TextRun } from './engine';
import { applyOutput, EMPTY_TRANSCRIPT, statusRows, type Transcript } from './transcript';
import { createZvmEngine } from './zvm/zvmEngine';

describe('statusRows', () => {
  it('splits every row into left and right parts and drops blank rows', () => {
    const rows = statusRows([
      ' Drawbridge                                   N   ',
      '                                                  ',
      ' Great Outdoors                            W  O  E',
      ' Rooms searched: 0/55',
    ]);
    expect(rows.shown).toEqual([
      { left: 'Drawbridge', right: 'N' },
      { left: 'Great Outdoors', right: 'W  O  E' },
      { left: 'Rooms searched: 0/55', right: '' },
    ]);
    expect(rows.overflow).toBe(false);
    expect(rows.all).toEqual(rows.shown);
  });

  it('shows one row as before, and nothing for an empty window', () => {
    expect(statusRows(['  West of House            Turns: 12   ']).shown).toEqual([
      { left: 'West of House', right: 'Turns: 12' },
    ]);
    expect(statusRows([]).shown).toEqual([]);
    expect(statusRows(['   ', '']).shown).toEqual([]);
  });

  it('keeps max - 1 rows past the cap and flags the overflow', () => {
    const status = ['One', 'Two', 'Three', 'Four', 'Five'];
    const rows = statusRows(status, 4);
    expect(rows.shown.map((row) => row.left)).toEqual(['One', 'Two', 'Three']);
    expect(rows.overflow).toBe(true);
    expect(rows.all.map((row) => row.left)).toEqual(status);
    // Exactly at the cap: everything shows.
    expect(statusRows(status.slice(0, 4), 4)).toMatchObject({ overflow: false });
    expect(statusRows(status.slice(0, 4), 4).shown).toHaveLength(4);
  });
});

describe('screens (S1.16)', () => {
  const p = (text: string, style = 'normal'): OutputBlock => ({
    type: 'paragraph',
    runs: [{ text: text, style: style as TextRun['style'] }],
  });
  const echo = (text: string): OutputBlock => ({
    type: 'paragraph',
    runs: [{ text: text, style: 'input' }],
    append: true,
  });
  const CLEAR: OutputBlock = { type: 'clear' };
  const shown = (t: Transcript) => t.paragraphs.filter((x) => !x.replaced).map((x) => x.text);

  it('starts a screen at the paragraph after a clear, and counts screens once per clear', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [p('Title'), p('>'), echo('menu')]);
    expect(t.screens).toBe(0);
    t = applyOutput(t, [CLEAR, CLEAR]);
    expect(t.screens).toBe(1);
    expect(t.cleared).toBe(true);
    // The clear may come in one update and the screen's text in the next; an `append` does not continue across it.
    t = applyOutput(t, [echo('ignored append'), p('> Topic one')]);
    expect(t.cleared).toBeUndefined();
    expect(t.paragraphs.map((x) => !!x.screen)).toEqual([false, false, true, false]);
    expect(t.paragraphs[2].text).toBe('ignored append');
  });

  it('replaces a screen reached by keys only, keeps one with a command and the first screen', () => {
    // The game's first screen (no clear before it) and a screen with a command stay.
    let t = applyOutput(EMPTY_TRANSCRIPT, [p('[Press any key]')]);
    t = applyOutput(t, [
      p('Intro.'),
      p('>'),
      echo('menu'),
      CLEAR,
      p('> Topic one'),
      p('  Topic two'),
    ]);
    expect(shown(t)).toEqual(['[Press any key]', 'Intro.', '>menu', '> Topic one', '  Topic two']);
    // A key: the menu draws itself again.
    t = applyOutput(t, [CLEAR, p('  Topic one'), p('> Topic two')]);
    expect(shown(t)).toEqual(['[Press any key]', 'Intro.', '>menu', '  Topic one', '> Topic two']);
    // Replaced paragraphs stay in the transcript, marked, with their screen start.
    expect(t.paragraphs.filter((x) => x.replaced).map((x) => x.text)).toEqual([
      '> Topic one',
      '  Topic two',
    ]);
    expect(t.paragraphs[3]).toMatchObject({ screen: true, replaced: true });
    expect(t.screens).toBe(2);
    // Leaving the menu: its last screen is replaced by the game's.
    t = applyOutput(t, [CLEAR, p('You put the menu away.'), p('>')]);
    expect(shown(t)).toEqual(['[Press any key]', 'Intro.', '>menu', 'You put the menu away.', '>']);
    // A command echoed in a screen keeps it.
    t = applyOutput(t, [echo('look'), p('Landing Stage'), CLEAR, p('A new screen')]);
    expect(shown(t)).toContain('Landing Stage');
  });

  it('keeps the flags of a paragraph continued by an append', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [p('a'), CLEAR, p('>')]);
    t = applyOutput(t, [echo('look')]);
    expect(t.paragraphs[1]).toMatchObject({ text: '>look', screen: true, input: true });
  });

  it('browses the menu of the Z-machine fixture without piling up its screens', async () => {
    const story = readFileSync('tests/fixtures/zmachine/lamp.z5');
    const engine = createZvmEngine();
    let t: Transcript = EMPTY_TRANSCRIPT;
    engine.onOutput((blocks) => (t = applyOutput(t, blocks)));
    await engine.load(
      story.buffer.slice(story.byteOffset, story.byteOffset + story.byteLength),
      {},
    );
    engine.sendChar(' ');
    engine.sendLine('menu');
    const count = (text: string) => shown(t).filter((x) => x.indexOf(text) >= 0).length;
    expect(count('About the lamp')).toBe(1);
    engine.sendChar('n');
    engine.sendChar('p');
    engine.sendChar('n');
    expect(count('About the lamp')).toBe(1);
    expect(shown(t).filter((x) => x.indexOf('> About') === 0)).toEqual(['> About the keeper']);
    // The menu's legend is in the status window.
    expect(t.status.join('\n')).toContain('Q = Quit Menu');
    engine.sendChar('q');
    expect(count('About the')).toBe(0);
    expect(count('You put the menu away.')).toBe(1);
    // The command that opened the menu is kept, echoed (Glk drops it with the cleared window).
    expect(shown(t).some((x) => /^>\s*menu$/.test(x))).toBe(true);
  });
});
