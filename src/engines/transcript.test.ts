import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OutputBlock, TextRun } from './engine';
import {
  applyOutput,
  boxParagraphs,
  EMPTY_TRANSCRIPT,
  splitUpper,
  statusRows,
  withBox,
  type Transcript,
} from './transcript';
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

// Upper windows recorded with the rendering survey (S7.3), each row padded to the 80 columns the game was given.
const row = (text: string) => (text + ' '.repeat(80)).slice(0, 80);
const rows = (...texts: string[]) => texts.map(row);
const BLANK = '';
// Vespers after X ME: the status line, then Inform's quote box under it.
const VESPERS = rows(
  ' Your Bedroom                                                         Vespers',
  BLANK,
  BLANK,
  BLANK,
  '                        From the sole of his foot',
  '                        even to the crown of his head',
  '                        there was no blemish in him.',
  BLANK,
  '                                 -- II Samuel 14:25',
  BLANK,
  BLANK,
);
// Anchorhead's opening epigraph: no status line above it.
const ANCHORHEAD = rows(
  BLANK,
  BLANK,
  BLANK,
  '                 The oldest and strongest emotion of mankind',
  '                 is fear, and the oldest and strongest kind',
  '                 of fear is fear of the unknown.',
  '                 -- H.P. Lovecraft',
  BLANK,
);
// Ordinary status windows: Bronze-like rows, and a window with a blank row and a list at the margin.
const STATUS = rows(
  ' Drawbridge                                   N',
  ' Great Outdoors            W  O  E',
);
const EXITS = rows(' Kitchen                                Moves: 3', BLANK, 'Exits: north, west');

describe('boxes in the upper window (S1.23)', () => {
  const p = (text: string, style = 'normal'): OutputBlock => ({
    type: 'paragraph',
    runs: [{ text: text, style: style as TextRun['style'] }],
  });
  const echo = (text: string): OutputBlock => ({
    type: 'paragraph',
    runs: [{ text: text, style: 'input' }],
    append: true,
  });
  const status = (lines: string[]): OutputBlock => ({ type: 'status', lines: lines });
  const texts = (paragraphs: Transcript['paragraphs']) =>
    paragraphs.filter((x) => x.text.trim()).map((x) => (x.box ? '[box] ' : '') + x.text);

  it('splits the status line from a box under it', () => {
    expect(splitUpper(VESPERS)).toEqual({ status: VESPERS.slice(0, 1), box: VESPERS.slice(1) });
    expect(splitUpper(ANCHORHEAD)).toEqual({ status: [], box: ANCHORHEAD });
  });

  it('finds no box in ordinary status windows, nor under a status line taller than the top zone', () => {
    expect(splitUpper(STATUS)).toEqual({ status: STATUS, box: [] });
    expect(splitUpper(EXITS)).toEqual({ status: EXITS, box: [] });
    expect(
      splitUpper(rows('One', 'Two', 'Three', 'Four', 'Five', BLANK, '   A box')),
    ).toMatchObject({
      box: [],
    });
    expect(splitUpper([])).toEqual({ status: [], box: [] });
  });

  it('makes a paragraph of each group of rows, one line per row, blank rows apart', () => {
    const box = boxParagraphs(splitUpper(VESPERS).box) || [];
    expect(box.map((x) => x.text)).toEqual([
      'From the sole of his foot\neven to the crown of his head\nthere was no blemish in him.',
      '-- II Samuel 14:25',
    ]);
    expect(box.every((x) => x.box && !x.input)).toBe(true);
    expect(boxParagraphs(['', '   '])).toBeUndefined();
  });

  it('shows the box at the start of the turn and keeps it there once the window shrinks', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [status(VESPERS.slice(0, 1)), p('Your Bedroom'), p('>')]);
    // As ZVM sends a turn: the upper window first, then the echoed command and the reply.
    t = applyOutput(t, [status(VESPERS), echo('x me'), p("You're not the man you were."), p('>')]);
    expect(t.box && t.box.paragraphs).toHaveLength(2);
    const shown = [
      'Your Bedroom',
      '>x me',
      '[box] From the sole of his foot\neven to the crown of his head\nthere was no blemish in him.',
      '[box] -- II Samuel 14:25',
      "You're not the man you were.",
      '>',
    ];
    expect(texts(withBox(t))).toEqual(shown);
    expect(texts(t.paragraphs)).not.toContain('[box] -- II Samuel 14:25');
    t = applyOutput(t, [status(VESPERS.slice(0, 1)), echo('look'), p('Your Bedroom'), p('>')]);
    expect(t.box).toBeUndefined();
    expect(texts(t.paragraphs)).toEqual(
      ['Your Bedroom', '>x me'].concat(shown.slice(2, 5), ['>look', 'Your Bedroom', '>']),
    );
    expect(withBox(t)).toBe(t.paragraphs);
  });

  it('opens the screen with a box drawn before the game cleared its window (an opening epigraph)', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [
      status(ANCHORHEAD),
      { type: 'clear' },
      p(''),
      p('                             A N C H O R H E A D'),
    ]);
    const shown = withBox(t);
    expect(shown[0].box && shown[0].screen).toBe(true);
    expect(shown.filter((x) => x.screen)).toHaveLength(1);
    t = applyOutput(t, [
      status(rows(' Outside the Real Estate Office')),
      { type: 'clear' },
      p('Rain.'),
    ]);
    expect(t.paragraphs[0].box).toBe(true);
    expect(t.paragraphs[0].text).toMatch(/^The oldest and strongest emotion of mankind\n/);
  });

  it('keeps no box while the main window is cleared and empty: the upper window is a menu (S1.22)', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [
      p('>'),
      echo('help'),
      { type: 'clear' },
      status(ANCHORHEAD),
    ]);
    expect(withBox(t)).toBe(t.paragraphs);
    t = applyOutput(t, [{ type: 'clear' }, status(STATUS)]);
    expect(t.paragraphs.some((x) => x.box)).toBe(false);
  });

  it('reads rows drawn again after a command as part of the status window, not a box', () => {
    // Metamorphoses: a centred line under the status line, on every turn.
    const humours = rows(
      '                                  Bare Room',
      BLANK,
      '                 sanguine, melancholic, choleric, phlegmatic',
    );
    let t = applyOutput(EMPTY_TRANSCRIPT, [p('>')]);
    t = applyOutput(t, [status(humours), echo('look'), p('Bare Room'), p('>')]);
    expect(t.box).toBeDefined();
    t = applyOutput(t, [status(humours), echo('x me'), p('You look as you always do.'), p('>')]);
    expect(t.box).toBeUndefined();
    t = applyOutput(t, [status(humours), echo('look'), p('Bare Room'), p('>')]);
    expect(t.box).toBeUndefined();
    expect(t.paragraphs.some((x) => x.box)).toBe(false);
  });

  it('shows the text of another window (the quote box in Glulx) as a box', () => {
    let t = applyOutput(EMPTY_TRANSCRIPT, [p('>')]);
    t = applyOutput(t, [
      { type: 'quote', lines: ['The sea is calm tonight.', '', '-- Matthew Arnold'] },
      echo('quote'),
      p('You remember the poem.'),
      p('>'),
    ]);
    expect(texts(withBox(t))).toEqual([
      '>quote',
      '[box] The sea is calm tonight.',
      '[box] -- Matthew Arnold',
      'You remember the poem.',
      '>',
    ]);
    t = applyOutput(t, [{ type: 'quote', lines: [] }, echo('look')]);
    expect(t.quote).toBeUndefined();
    expect(texts(t.paragraphs)).toEqual([
      '>quote',
      '[box] The sea is calm tonight.',
      '[box] -- Matthew Arnold',
      'You remember the poem.',
      '>look',
    ]);
  });

  it('restores box paragraphs from a save', () => {
    const t = applyOutput(EMPTY_TRANSCRIPT, [
      { type: 'paragraph', runs: [{ text: 'A line\nAnother', style: 'normal' }], box: true },
    ]);
    expect(t.paragraphs[0]).toMatchObject({ box: true, text: 'A line\nAnother' });
  });
});
