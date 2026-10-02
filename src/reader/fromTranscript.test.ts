import { describe, expect, it } from 'vitest';
import { applyOutput, EMPTY_TRANSCRIPT } from '../engines/transcript';
import { lastScreenStart, readerBlocks } from './fromTranscript';

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
