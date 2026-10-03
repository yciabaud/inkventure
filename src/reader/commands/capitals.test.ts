import { describe, expect, it } from 'vitest';
import { MAX_NAMED, namedCommands, type NamedSource } from './capitals';
import { verbTable } from './verbs';

const EN = verbTable('en');
const FR = verbTable('fr');
const p = (text: string): NamedSource => ({ text: text });
const labels = (texts: Array<string | NamedSource>, exclude?: string[]) =>
  namedCommands(
    texts.map((t) => (typeof t === 'string' ? p(t) : t)),
    EN,
    exclude,
  ).map((chip) => chip.label);

describe('commands named in capitals', () => {
  it('finds the commands the featured games announce', () => {
    // Bronze, Anchorhead, Violet, Lost Pig, Repeat the Ending.
    expect(
      labels([
        'If you have not played Bronze before, you may still want to type HELP to learn more.',
      ]),
    ).toEqual(['HELP']);
    expect(labels(['(Type HELP or ABOUT for some useful information.)'])).toEqual([
      'HELP',
      'ABOUT',
    ]);
    expect(labels(['(New readers type ABOUT; HINTS available)'])).toEqual(['ABOUT', 'HINTS']);
    expect(labels(['(For help, use "HELP".)'])).toEqual(['HELP']);
    expect(labels(['The *GUIDE* command opens the "Reader\'s Companion".'])).toEqual(['GUIDE']);
    expect(labels(['…can be found *INSIDE* the house. [PS 1].'])).toEqual(['INSIDE', 'PS 1']);
  });

  it('takes a command listed after an announced one in the same sentence, not in the next one', () => {
    expect(
      labels(["Type WAKE UP if you feel sleepy, or LOGBOOK to read the keeper's log."]),
    ).toEqual(['WAKE UP', 'LOGBOOK']);
    expect(labels(['Just type FEMALE or, more stylishly, HETERONORMATIVITY OFF.'])).toEqual([
      'FEMALE',
      'HETERONORMATIVITY OFF',
    ]);
    expect(labels(['Type WAKE UP. The DOOR or the WINDOW will do.'])).toEqual(['WAKE UP']);
  });

  it('accepts the story examples: brackets, quotes, French', () => {
    expect(labels(['Type GUIDE for a list of commands.'])).toEqual(['GUIDE']);
    expect(labels(['You may ask for a [HINT] at any time.'])).toEqual(['HINT']);
    expect(labels(['Try "ABOUT" first.'])).toEqual(['ABOUT']);
    expect(
      namedCommands([p('Tapez AIDE pour la liste des commandes.')], FR).map((c) => c.command),
    ).toEqual(['aide']);
  });

  it('gives one chip for a multi-word command, filling the field before a placeholder', () => {
    // TALK TO is already in the bar ("Talk to…" in More…).
    expect(namedCommands([p('You can TALK TO someone.')], EN)).toEqual([]);
    const chips = namedCommands([p('You can WAVE AT someone, or type WAKE UP.')], EN);
    expect(chips.map((c) => [c.label, c.command, c.needsObject])).toEqual([
      ['WAVE AT…', 'wave at', true],
      ['WAKE UP', 'wake up', false],
    ]);
  });

  it('ignores headings, emphasis, room names, numerals and what the bar or the menu already does', () => {
    // A paragraph all in capitals: a title, or a list of examples (Violet's ABOUT).
    expect(labels(['ANCHORHEAD', 'EXAMINE DESK (or X DESK)', 'TAKE ITINERARY'])).toEqual([]);
    // A heading run inside a paragraph.
    expect(
      labels([
        {
          text: 'THE BAT An Interactive Soirée',
          runs: [
            { text: 'THE BAT', style: 'subheader' },
            { text: ' An Interactive Soirée', style: 'normal' },
          ],
        },
      ]),
    ).toEqual([]);
    // Emphasis with no cue (Photopia), a room name, Roman numerals.
    expect(labels(['"Welcome back to the land of the LIVING, bud," Rob says.'])).toEqual([]);
    expect(labels(['You are NOT alone.'])).toEqual([]);
    expect(labels(['Type DRAWBRIDGE to go back.'], ['Drawbridge'])).toEqual([]);
    expect(labels(['Type ACT II to skip ahead.'])).toEqual([]);
    // The bar has LOOK, INVENTORY, I; the menu saves and restores.
    expect(
      labels(['Type LOOK, INVENTORY or I. You can save the game by typing SAVE, or QUIT.']),
    ).toEqual([]);
    // Single letters, and a serial number.
    expect(labels(['Type X to examine. Release 2 / ZCODE-1-070917-994E'])).toEqual([]);
  });

  it('keeps announced commands first, without duplicates, at most four', () => {
    expect(
      labels([
        'CREDITS and COPYRIGHT are available.',
        'Type HELP, or try ABOUT.',
        'Type HELP again.',
      ]),
    ).toEqual(['HELP', 'ABOUT', 'CREDITS', 'COPYRIGHT']);
    expect(labels(['Type ONE, TWO, THREE, FOUR or FIVE.'])).toHaveLength(MAX_NAMED);
  });
});
