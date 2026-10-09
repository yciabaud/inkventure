import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutputBlock } from '../engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../transcript';
import { GlkOteBridge, MIN_TIMER_MS, type Update } from './bridge';

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

describe('GlkOteBridge cleared window (S1.16)', () => {
  function withInput() {
    let transcript: Transcript = EMPTY_TRANSCRIPT;
    const accepted: unknown[] = [];
    const bridge = new GlkOteBridge(
      {
        output: (blocks: OutputBlock[]) => (transcript = applyOutput(transcript, blocks)),
        input: () => undefined,
        exit: () => undefined,
        error: () => undefined,
      },
      80,
    );
    bridge.init({ accept: (event: unknown) => accepted.push(event) } as never);
    let gen = 0;
    const update = (data: Omit<Update, 'type' | 'gen'>) =>
      bridge.update({ type: 'update', gen: ++gen, ...data });
    return { bridge, update, transcript: () => transcript };
  }
  const line = (text: string, append = false) => ({
    append: append,
    content: [{ style: 'normal', text: text }],
  });

  it('echoes the command again when the game clears the window in its reply', () => {
    const s = withInput();
    s.update({
      windows: WINDOWS,
      content: [{ id: 1, text: [line('Landing Stage'), line('>')] }],
      input: [{ id: 1, type: 'line', gen: 1, maxlen: 120 }],
    });
    s.bridge.sendLine('menu');
    // Glk sends only what follows the clear: its own echo of the command is gone.
    s.update({
      content: [{ id: 1, clear: true, text: [line('> About the lamp')] }],
      input: [{ id: 1, type: 'char', gen: 2 }],
    });
    const paragraphs = s.transcript().paragraphs;
    expect(paragraphs.map((p) => p.text)).toEqual(['Landing Stage', '>menu', '> About the lamp']);
    expect(paragraphs[1].input).toBe(true);
    expect(paragraphs[2].screen).toBe(true);
  });

  it('adds nothing when the reply does not clear, or after a key', () => {
    const s = withInput();
    s.update({
      windows: WINDOWS,
      content: [{ id: 1, text: [line('>')] }],
      input: [{ id: 1, type: 'line', gen: 1, maxlen: 120 }],
    });
    s.bridge.sendLine('look');
    s.update({
      content: [{ id: 1, text: [line('look', true), line('A stone jetty.')] }],
      input: [{ id: 1, type: 'char', gen: 2 }],
    });
    s.bridge.sendChar('n');
    s.update({ content: [{ id: 1, clear: true, text: [line('Menu')] }] });
    expect(s.transcript().paragraphs.map((p) => p.text)).toEqual([
      '>look',
      'A stone jetty.',
      'Menu',
    ]);
  });
});

describe('GlkOteBridge other buffer windows (S1.23)', () => {
  const line = (text: string, append = false) => ({
    append: append,
    content: [{ style: 'blockquote', text: text }],
  });

  it('reports the text of a buffer window other than the main one as a quote, and its closing', () => {
    const s = setup();
    s.update({
      windows: WINDOWS,
      content: [{ id: 1, text: [{ content: [{ style: 'normal', text: '>' }] }] }],
    });
    // Inform's quote box in Glulx: a buffer window opened over the main one, then closed the next turn.
    s.update({
      windows: WINDOWS.concat([{ id: 3, type: 'buffer' as const }]),
      content: [
        {
          id: 3,
          clear: true,
          text: [line('The sea is calm'), line(' tonight.', true), line('-- M. Arnold')],
        },
        { id: 1, text: [{ append: true, content: [{ style: 'input', text: 'quote' }] }] },
      ],
    });
    let t = s.transcript();
    expect(t.quote).toEqual(['The sea is calm tonight.', '-- M. Arnold']);
    expect(t.paragraphs.map((p) => p.text)).toEqual(['>quote']);
    expect(t.screens).toBe(0);
    s.update({ windows: WINDOWS });
    t = s.transcript();
    expect(t.quote).toBeUndefined();
    expect(t.paragraphs.map((p) => p.text)).toEqual([
      '>quote',
      'The sea is calm tonight.\n-- M. Arnold',
    ]);
  });

  it('takes the window that asks for input as the main one', () => {
    const s = setup();
    s.update({
      windows: [
        { id: 4, type: 'buffer' as const },
        { id: 5, type: 'buffer' as const },
      ],
      content: [
        { id: 4, text: [line('A side panel')] },
        { id: 5, text: [{ content: [{ style: 'normal', text: 'The story.' }] }] },
      ],
      input: [{ id: 5, type: 'line', gen: 1, maxlen: 120 }],
    });
    s.update({
      content: [{ id: 5, text: [{ content: [{ style: 'normal', text: 'More story.' }] }] }],
    });
    const t = s.transcript();
    expect(t.paragraphs.map((p) => p.text)).toEqual(['The story.', 'More story.']);
    expect(t.quote).toEqual(['A side panel']);
  });
});

describe('GlkOteBridge timer events (S1.25)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A bridge whose game answers each timer event with another update (as glkapi does after glk_select). */
  function withTimer() {
    vi.useFakeTimers();
    const accepted: Array<Record<string, unknown>> = [];
    const bridge = new GlkOteBridge(
      {
        output: () => undefined,
        input: () => undefined,
        exit: () => undefined,
        error: () => undefined,
      },
      80,
    );
    let gen = 0;
    const update = (data: Omit<Update, 'type' | 'gen'>) =>
      bridge.update({ type: 'update', gen: ++gen, ...data });
    bridge.init({
      accept: (event: Record<string, unknown>) => {
        accepted.push(event);
        if (event.type === 'timer') update({});
      },
    } as never);
    const timers = () => accepted.filter((event) => event.type === 'timer');
    return { bridge, update, accepted, timers };
  }

  it('declares timer support to the Glk library', () => {
    const s = withTimer();
    expect(s.accepted[0]).toMatchObject({ type: 'init', support: ['timer'] });
  });

  it('sends timer events at the interval the game asks for, then stops on 0', () => {
    const s = withTimer();
    s.update({ windows: WINDOWS, timer: 2000 });
    vi.advanceTimersByTime(1999);
    expect(s.timers()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(s.timers()).toHaveLength(1);
    // With the generation of the update it answers.
    expect(s.timers()[0]).toEqual({ type: 'timer', gen: 1 });
    vi.advanceTimersByTime(4000);
    expect(s.timers()).toHaveLength(3);
    s.update({ timer: null });
    vi.advanceTimersByTime(10000);
    expect(s.timers()).toHaveLength(3);
  });

  it('never sends them more often than once a second', () => {
    const s = withTimer();
    s.update({ windows: WINDOWS, timer: 10 });
    vi.advanceTimersByTime(MIN_TIMER_MS - 1);
    expect(s.timers()).toHaveLength(0);
    vi.advanceTimersByTime(MIN_TIMER_MS * 5 + 1);
    expect(s.timers()).toHaveLength(6);
  });

  it('sends none while timers are off, nor after the game ends or is replaced', () => {
    const s = withTimer();
    s.update({ windows: WINDOWS, timer: 1000 });
    s.bridge.setTimersActive(false);
    vi.advanceTimersByTime(5000);
    expect(s.timers()).toHaveLength(0);
    // Back on: a full interval later.
    s.bridge.setTimersActive(true);
    vi.advanceTimersByTime(999);
    expect(s.timers()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(s.timers()).toHaveLength(1);
    s.bridge.dispose();
    vi.advanceTimersByTime(5000);
    expect(s.timers()).toHaveLength(1);

    const t = withTimer();
    t.update({ windows: WINDOWS, timer: 1000 });
    t.bridge.update({ type: 'update', gen: 99, exit: true });
    vi.advanceTimersByTime(5000);
    expect(t.timers()).toHaveLength(0);
  });

  it('skips a tick while the game is running (no update since its last event)', () => {
    const s = withTimer();
    s.update({
      windows: WINDOWS,
      input: [{ id: 1, type: 'line', gen: 1, maxlen: 120 }],
      timer: 1000,
    });
    // A command sent: the game runs (a Glulx turn between slices) until its next update.
    s.bridge.sendLine('wait');
    vi.advanceTimersByTime(1000);
    expect(s.timers()).toHaveLength(0);
    s.update({ input: [{ id: 1, type: 'line', gen: 2, maxlen: 120 }] });
    vi.advanceTimersByTime(1000);
    expect(s.timers()).toHaveLength(1);
  });
});
