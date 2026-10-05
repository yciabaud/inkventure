import { describe, expect, it } from 'vitest';
import { applyOutput, EMPTY_TRANSCRIPT } from '../engines/transcript';
import { lastScreenStart, lineLayout, readerBlocks } from './fromTranscript';

const run = (text: string, style = 'normal' as const) => ({ text, style });

describe('readerBlocks', () => {
  const t1 = applyOutput(EMPTY_TRANSCRIPT, [
    { type: 'paragraph', runs: [run('West of House', 'header' as never)] },
    { type: 'paragraph', runs: [] },
    { type: 'paragraph', runs: [run('You are standing in an open field.')] },
    { type: 'paragraph', runs: [] },
    { type: 'paragraph', runs: [run('>')] },
  ]);

  it('drops blank lines and, while a command is awaited, the bare prompt', () => {
    expect(readerBlocks(t1.paragraphs, true).map((b) => b.text)).toEqual([
      'West of House',
      'You are standing in an open field.',
    ]);
    expect(readerBlocks(t1.paragraphs, false).map((b) => b.text)).toContain('>');
  });

  it('shows the prompt with the echoed command as an input block, and keeps the other blocks', () => {
    const before = readerBlocks(t1.paragraphs, true);
    const t2 = applyOutput(t1, [
      { type: 'paragraph', runs: [run('look', 'input' as never)], append: true },
      { type: 'paragraph', runs: [run('It is a nice day.')] },
    ]);
    const after = readerBlocks(t2.paragraphs, true);
    expect(after.map((b) => b.kind)).toEqual(['text', 'text', 'input', 'text']);
    expect(after[2].text).toBe('>look');
    expect(after[2].runs).toEqual([run('>'), { text: 'look', style: 'input' }]);
    // Same block objects for unchanged paragraphs (their measurements are reused).
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('turns a picture into an image block, kept even with no text', () => {
    const t = applyOutput(EMPTY_TRANSCRIPT, [
      { type: 'paragraph', runs: [run('A painting.')] },
      { type: 'image', image: 3, width: 60, height: 40, alt: 'A lighthouse' },
      { type: 'image', image: 4, width: 10, height: 10 },
    ]);
    const blocks = readerBlocks(t.paragraphs, true);
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'image', 'image']);
    expect(blocks[1]).toEqual({
      kind: 'image',
      text: '',
      image: { id: 3, width: 60, height: 40, alt: 'A lighthouse' },
    });
    expect(blocks[2].image).toEqual({ id: 4, width: 10, height: 10 });
    expect(readerBlocks(t.paragraphs, true)[1]).toBe(blocks[1]);
  });
});

describe('readerBlocks and screens (S1.16)', () => {
  const p = (text: string) => ({ type: 'paragraph' as const, runs: [run(text)] });
  const t = applyOutput(EMPTY_TRANSCRIPT, [
    p('Before'),
    { type: 'clear' },
    p(''),
    p('Menu one'),
    { type: 'clear' },
    p('Menu two'),
  ]);

  it('leaves out replaced screens, and moves a screen start past a blank line', () => {
    const blocks = readerBlocks(t.paragraphs, false);
    expect(blocks.map((b) => [b.text, !!b.screen])).toEqual([
      ['Before', false],
      ['Menu two', true],
    ]);
    expect(lastScreenStart(blocks)).toBe(1);
    // The same block objects on the next call (the page turner reuses their measurements).
    expect(readerBlocks(t.paragraphs, false)[1]).toBe(blocks[1]);
  });

  it('keeps replaced screens for the Transcript view', () => {
    const blocks = readerBlocks(t.paragraphs, false, true);
    expect(blocks.map((b) => [b.text, !!b.screen])).toEqual([
      ['Before', false],
      ['Menu one', true],
      ['Menu two', true],
    ]);
    expect(
      lastScreenStart(readerBlocks(applyOutput(EMPTY_TRANSCRIPT, [p('a')]).paragraphs, false)),
    ).toBe(-1);
  });
});

// Lines laid out for an 80-column screen, recorded with the rendering survey (S7.3).
const ANCHORHEAD = ' '.repeat(29) + 'A N C H O R H E A D';
const PRESS_R = ' '.repeat(15) + "[Press 'R' to restore; any other key to begin]";
const WELCOME = ' '.repeat(30) + 'Welcome to CURSES';
const FILAMENTS = ' '.repeat(25) + 'F.I.L.A.M.E.N.T.S';
const BYLINE = ' '.repeat(88) + 'par JB Ferrant, lejibe@hotmail.com';

describe('lineLayout (S1.23)', () => {
  it('centres a line the game centred with spaces', () => {
    for (const line of [ANCHORHEAD, PRESS_R, WELCOME]) {
      expect(lineLayout(line)).toEqual({
        trim: line.length - line.trimStart().length,
        align: 'center',
      });
    }
  });

  it('turns a wide indent into a share of the column, and drops it from a line wider than the screen', () => {
    expect(lineLayout(FILAMENTS)).toEqual({ trim: 25, indent: 31.3 });
    expect(lineLayout(BYLINE)).toEqual({ trim: 88 });
  });

  it('keeps a small indent, a blank line and several lines as typed', () => {
    expect(lineLayout('   ...de nos jours...')).toBeNull();
    expect(lineLayout('    ')).toBeNull();
    expect(lineLayout('          one\n          two')).toBeNull();
    expect(lineLayout('No indent at all')).toBeNull();
  });

  it('lays out the blocks: spaces dropped from the runs, boxes and the echoed command left alone', () => {
    const t = applyOutput(EMPTY_TRANSCRIPT, [
      {
        type: 'paragraph',
        runs: [run(ANCHORHEAD.slice(0, 10)), run(ANCHORHEAD.slice(10), 'user1' as never)],
      },
      { type: 'paragraph', runs: [run(FILAMENTS)] },
      { type: 'paragraph', runs: [run('Box line\nAnother')], box: true },
      { type: 'paragraph', runs: [run('>' + ' '.repeat(20) + 'x')] },
      { type: 'paragraph', runs: [run('look', 'input' as never)], append: true },
    ]);
    const blocks = readerBlocks(t.paragraphs, false);
    expect(blocks[0]).toMatchObject({
      text: 'A N C H O R H E A D',
      align: 'center',
      runs: [{ text: 'A N C H O R H E A D', style: 'user1' }],
    });
    expect(blocks[1]).toMatchObject({ text: 'F.I.L.A.M.E.N.T.S', indent: 31.3 });
    expect(blocks[1].align).toBeUndefined();
    expect(blocks[2]).toMatchObject({ text: 'Box line\nAnother', align: 'center' });
    expect(blocks[3]).toMatchObject({ kind: 'input', text: '>' + ' '.repeat(20) + 'xlook' });
    expect(blocks[3].align).toBeUndefined();
  });
});
