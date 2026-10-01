import { describe, expect, it } from 'vitest';
import { findKeys, MAX_KEYS, shortLabel } from './keys';

/** "N — Next" for each chip, to compare in one line. */
function chips(texts: string[], status: string[] = []): string[] {
  return findKeys(texts, status).keys.map((k) => (k.label ? k.key + ' — ' + k.label : k.key));
}

describe('findKeys', () => {
  it('reads Repeat the Ending: option 1 or 2', () => {
    expect(chips(['Choose option 1 or 2.'])).toEqual(['1', '2']);
  });

  it('reads Blue Lacuna: N, R and C with what they do', () => {
    const text =
      'Press N to begin from the beginning, R to restore an existing story, or C to show the Table of Contents.';
    expect(chips([text])).toEqual(['N — begin', 'R — restore', 'C — show the Table']);
  });

  it('sends letters in lower case', () => {
    const keys = findKeys(['Press N to begin.'], []).keys;
    expect(keys[0]).toEqual({ key: 'N', send: 'n', label: 'begin' });
  });

  it('reads an Inform menu legend in the status rows', () => {
    const status = [
      '                     Instructions',
      ' N = next subject                       P = previous',
      ' RETURN = read subject                  Q = resume game',
    ];
    expect(chips([], status)).toEqual([
      'N — next subject',
      'P — previous',
      'return — read subject',
      'Q — resume game',
    ]);
    expect(findKeys([], status).keys[2].send).toBe('return');
  });

  it('reads a legend on one line with commas (Bronze)', () => {
    expect(chips(['N = Next, P = Previous, Q = Quit Menu, ENTER = Select'])).toEqual([
      'N — Next',
      'P — Previous',
      'Q — Quit Menu',
      'return — Select',
    ]);
  });

  it("reads Anchorhead: Press 'R' to restore", () => {
    expect(chips(["Press 'R' to restore; any other key to begin."])).toEqual(['R — restore']);
  });

  it('reads quoted and bracketed keys', () => {
    expect(chips(['Press "q" to quit, or [H] for help.'])).toEqual(['Q — quit']);
    expect(chips(['Type [X] to exit.'])).toEqual(['X — exit']);
  });

  it('reads Y/N and yes or no', () => {
    expect(chips(['Are you sure (Y/N)?'])).toEqual(['Y', 'N']);
    expect(chips(['Please answer yes or no.'])).toEqual(['Y', 'N']);
    expect(chips(['Répondez par oui ou non.'])).toEqual(['O', 'N']);
  });

  it('reads numbered options with their labels', () => {
    expect(chips(['1. Story mode', '(2) Autonomous mode', '3) Quit', 'Your choice?'])).toEqual([
      '1 — Story mode',
      '2 — Autonomous mode',
      '3 — Quit',
    ]);
  });

  it('finds no key in a "press any key" prompt: Continue only', () => {
    expect(findKeys(['[Press any key to begin.]'], [])).toEqual({ keys: [], space: false });
    expect(chips(['Press a key to continue.'])).toEqual([]);
    expect(chips(['[MORE]'])).toEqual([]);
    expect(chips(['Type a command to go on.'])).toEqual([]);
    expect(chips(['Am I to believe that? A to Z, from 1 to 10.'])).toEqual([]);
  });

  it('notices a game that asks for the space bar', () => {
    expect(findKeys(['Press SPACE to continue.'], [])).toEqual({ keys: [], space: true });
    expect(findKeys(['Hit the space bar.'], []).space).toBe(true);
    expect(findKeys(['Appuyez sur la barre d’espace.'], []).space).toBe(true);
  });

  it('removes duplicates and keeps the first label found', () => {
    expect(chips(['Press N.', 'N to go on, Q to quit.', 'Press Q to quit.'])).toEqual([
      'N — go on',
      'Q — quit',
    ]);
  });

  it(`shows at most ${MAX_KEYS} keys`, () => {
    expect(chips(['Choose 1, 2, 3, 4, 5, 6, 7, 8 or 9.'])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
  });

  it('reads French prompts', () => {
    expect(chips(['Appuyez sur N pour commencer, ou sur R pour reprendre une partie.'])).toEqual([
      'N — commencer',
      'R — reprendre',
    ]);
    expect(chips(['Tapez Q pour quitter.'])).toEqual(['Q — quitter']);
  });

  it('lists the status rows first, then the text', () => {
    expect(chips(['Press X to exit.'], [' N = Next   Q = Quit Menu'])).toEqual([
      'N — Next',
      'Q — Quit Menu',
      'X — exit',
    ]);
  });
});

describe('shortLabel', () => {
  it('keeps a few words, not ending on an article or a preposition', () => {
    expect(shortLabel('begin from the beginning')).toBe('begin');
    expect(shortLabel('show the Table of Contents')).toBe('show the Table');
    expect(shortLabel('Quit Menu')).toBe('Quit Menu');
    expect(shortLabel('  resume   game ')).toBe('resume game');
    expect(shortLabel('extraordinarilylongword')).toBe('extraordinarilylongword');
  });
});
