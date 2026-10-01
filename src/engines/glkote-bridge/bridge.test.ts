import { describe, expect, it } from 'vitest';
import type { OutputBlock } from '../engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../transcript';
import { GlkOteBridge, type Update } from './bridge';

/** A bridge fed GlkOte updates by hand, collecting what it reports into a transcript. */
function setup() {
  let transcript: Transcript = EMPTY_TRANSCRIPT;
  const bridge = new GlkOteBridge(
    {
      output: (blocks: OutputBlock[]) => (transcript = applyOutput(transcript, blocks)),
      input: () => undefined,
      exit: () => undefined,
      error: () => undefined,
    },
    80,
  );
  let gen = 0;
  const update = (data: Omit<Update, 'type' | 'gen'>, at?: number) =>
    bridge.update({ type: 'update', gen: at === undefined ? ++gen : at, ...data });
  return { update, transcript: () => transcript };
}

const WINDOWS = [
  { id: 1, type: 'buffer' as const },
  { id: 2, type: 'grid' as const, gridwidth: 80, gridheight: 1 },
];

function statusRow(left: string, right: string) {
  return [{ line: 0, content: [{ style: 'normal', text: (' ' + left).padEnd(60) + right }] }];
}

describe('GlkOteBridge status line', () => {
  it('turns grid window updates into the status line, turn after turn', () => {
    const s = setup();
    s.update({
      windows: WINDOWS,
      content: [
        { id: 2, lines: statusRow('Landing Stage', 'Score: 0  Moves: 0') },
        { id: 1, text: [{ content: [{ style: 'normal', text: 'You step ashore.' }] }] },
      ],
      input: [{ id: 1, type: 'line', gen: 1, maxlen: 120 }],
    });
    expect(splitStatus(s.transcript().status)).toEqual({
      left: 'Landing Stage',
      right: 'Score: 0  Moves: 0',
    });
    expect(s.transcript().paragraphs.map((p) => p.text)).toEqual(['You step ashore.']);

    // The next turn rewrites the row: the status line follows.
    s.update({
      content: [{ id: 2, lines: statusRow('Foot of the Tower', 'Score: 1  Moves: 1') }],
      input: [{ id: 1, type: 'line', gen: 2, maxlen: 120 }],
    });
    expect(splitStatus(s.transcript().status)).toEqual({
      left: 'Foot of the Tower',
      right: 'Score: 1  Moves: 1',
    });
  });

  it('keeps unchanged rows of a taller grid and clears the status line when the grid closes', () => {
    const s = setup();
    const windows = [WINDOWS[0], { id: 2, type: 'grid' as const, gridwidth: 80, gridheight: 2 }];
    s.update({
      windows: windows,
      content: [
        {
          id: 2,
          lines: [
            { line: 0, content: [{ style: 'normal', text: 'Cellar' }] },
            { line: 1, content: [{ style: 'normal', text: 'Lamp: lit' }] },
          ],
        },
      ],
    });
    // Content in the flat form (style, text, style, text…) too.
    s.update({ content: [{ id: 2, lines: [{ line: 0, content: ['normal', 'Kitchen'] }] }] });
    expect(s.transcript().status).toEqual(['Kitchen', 'Lamp: lit']);
    expect(splitStatus(s.transcript().status)).toEqual({ left: 'Kitchen', right: '' });

    s.update({ windows: [WINDOWS[0]] });
    expect(s.transcript().status).toEqual([]);
  });

  it('ignores updates of an older generation', () => {
    const s = setup();
    s.update({ windows: WINDOWS, content: [{ id: 2, lines: statusRow('Now', '') }] });
    s.update({ content: [{ id: 2, lines: statusRow('Before', '') }] }, 0);
    expect(splitStatus(s.transcript().status).left).toBe('Now');
  });
});

describe('splitStatus', () => {
  it('splits the location from the score / turns on a run of spaces', () => {
    expect(splitStatus(['  West of House            Turns: 12   '])).toEqual({
      left: 'West of House',
      right: 'Turns: 12',
    });
    expect(splitStatus(['Behind House'])).toEqual({ left: 'Behind House', right: '' });
    expect(splitStatus([])).toEqual({ left: '', right: '' });
  });
});

describe('GlkOteBridge graphics windows and exit', () => {
  it('ignores what is drawn in a graphics window, and reports an `exit: true` update as the end', () => {
    let exited = false;
    let transcript: Transcript = EMPTY_TRANSCRIPT;
    const bridge = new GlkOteBridge(
      {
        output: (blocks: OutputBlock[]) => (transcript = applyOutput(transcript, blocks)),
        input: () => undefined,
        exit: () => (exited = true),
        error: () => undefined,
      },
      80,
    );
    bridge.update({
      type: 'update',
      gen: 1,
      windows: [
        { id: 1, type: 'buffer' },
        { id: 3, type: 'graphics' },
      ],
      content: [{ id: 1, text: [{ content: ['normal', 'Ready.'] }] }],
      input: [{ id: 1, type: 'line', gen: 1, maxlen: 64 }],
    });
    expect(transcript.paragraphs.map((p) => p.text)).toEqual(['Ready.']);
    expect(bridge.waitingFor).toBe('line');

    bridge.update({ type: 'update', gen: 2, input: [], exit: true });
    expect(exited).toBe(true);
    expect(bridge.hasExited).toBe(true);
    expect(bridge.waitingFor).toBe(null);
  });
});

describe('GlkOteBridge pictures', () => {
  const picture = (image: number, alttext?: string) => ({
    special: 'image' as const,
    image: image,
    width: 600,
    height: 400,
    alignment: 'inlineup',
    ...(alttext ? { alttext: alttext } : {}),
  });

  it('turns a picture in the main window into an image block, splitting the text around it', () => {
    const blocks: OutputBlock[] = [];
    const bridge = new GlkOteBridge(
      {
        output: (out: OutputBlock[]) => blocks.push(...out),
        input: () => undefined,
        exit: () => undefined,
        error: () => undefined,
      },
      80,
    );
    bridge.update({
      type: 'update',
      gen: 1,
      windows: [{ id: 1, type: 'buffer' }],
      content: [
        {
          id: 1,
          text: [
            { content: ['normal', 'You look at it.'] },
            { content: [picture(1, 'A lighthouse')] },
            { append: true, content: ['normal', 'Before ', picture(2), 'normal', 'after.'] },
            {},
          ],
        },
      ],
    });
    expect(blocks).toEqual([
      { type: 'paragraph', runs: [{ text: 'You look at it.', style: 'normal' }] },
      { type: 'image', image: 1, width: 600, height: 400, alt: 'A lighthouse' },
      { type: 'paragraph', runs: [{ text: 'Before ', style: 'normal' }], append: true },
      { type: 'image', image: 2, width: 600, height: 400 },
      { type: 'paragraph', runs: [{ text: 'after.', style: 'normal' }] },
      { type: 'paragraph', runs: [] },
    ]);

    // In the transcript: a paragraph of its own, which later appended text does not join.
    const transcript = applyOutput(EMPTY_TRANSCRIPT, [
      blocks[1],
      { type: 'paragraph', runs: [{ text: 'More.', style: 'normal' }], append: true },
    ]);
    expect(transcript.paragraphs).toEqual([
      {
        runs: [],
        text: '',
        input: false,
        image: { image: 1, width: 600, height: 400, alt: 'A lighthouse' },
      },
      { runs: [{ text: 'More.', style: 'normal' }], text: 'More.', input: false },
    ]);
  });
});
