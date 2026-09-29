import { describe, expect, it } from 'vitest';
import { applyOutput, EMPTY_TRANSCRIPT } from '../engines/transcript';
import { readerBlocks } from './fromTranscript';

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
});
