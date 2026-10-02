import { describe, expect, it } from 'vitest';
import { asksYesNo, findAnswers, MAX_OPTIONS, numberedOptions } from './answers';

const labels = (paragraphs: string[], language: 'en' | 'fr' = 'en') =>
  findAnswers(paragraphs, language).map((chip) => chip.label);

describe('yes/no questions', () => {
  it('finds the questions of the featured games, with or without the prompt after them', () => {
    // Photopia, Eat Me and The Bat, Bronze (prompt in the same paragraph), Counterfeit Monkey.
    expect(asksYesNo('Would you like instructions? ')).toBe(true);
    expect(asksYesNo('Have you played interactive fiction before?')).toBe(true);
    expect(asksYesNo('Have you played interactive fiction before? >')).toBe(true);
    expect(asksYesNo('Can you hear me? >> ')).toBe(true);
    expect(asksYesNo('Are you sure you want to restart?')).toBe(true);
    expect(asksYesNo('“Do you want some tea?”')).toBe(true);
    expect(asksYesNo('The door creaks. Shall we go on?')).toBe(true);
  });

  it('finds an explicit "yes or no", with or without a question mark', () => {
    expect(asksYesNo('Please answer yes or no.')).toBe(true);
    expect(asksYesNo('Restart the game (y/n)')).toBe(true);
    expect(asksYesNo('Voulez-vous recommencer ? [o/n]')).toBe(true);
    expect(asksYesNo('Répondez par oui ou non.')).toBe(true);
  });

  it('finds French questions to the player', () => {
    expect(asksYesNo('Voulez-vous des instructions ?')).toBe(true);
    expect(asksYesNo('As-tu déjà joué à une fiction interactive ?')).toBe(true);
    expect(asksYesNo('Est-ce que vous voulez continuer ?')).toBe(true);
  });

  it('ignores questions that are not yes/no questions to the player', () => {
    // A question in a description, a "wh-" question, a question in the middle of a paragraph.
    expect(asksYesNo('Is that a light in the distance?')).toBe(false);
    expect(asksYesNo('What do you want to do now?')).toBe(false);
    expect(asksYesNo('Où voulez-vous aller ?')).toBe(false);
    expect(asksYesNo('Would you like tea? The kettle whistles in the kitchen.')).toBe(false);
    expect(asksYesNo('(For help, use "HELP".)')).toBe(false);
    expect(asksYesNo('>')).toBe(false);
    // "yes" or "no" alone is not "yes or no".
    expect(asksYesNo('The sign says NO ENTRY.')).toBe(false);
  });

  it('gives Yes and No in the game language, after the bare prompt is left out', () => {
    expect(
      findAnswers(['Bronze', 'Have you played interactive fiction before?', '>'], 'en'),
    ).toEqual([
      { label: 'Yes', send: 'yes' },
      { label: 'No', send: 'no' },
    ]);
    expect(labels(['Voulez-vous des instructions ?', '> '], 'fr')).toEqual(['Oui', 'Non']);
    // Only the last paragraph counts.
    expect(labels(['Would you like instructions?', 'You are in a field.', '>'])).toEqual([]);
    expect(labels(['>'])).toEqual([]);
    expect(labels([])).toEqual([]);
  });
});

describe('numbered options', () => {
  it('reads The Impossible Bottle: four options before the prompt, with the start of each', () => {
    const chips = findAnswers(
      [
        '“Emma, be a doll and clean up your toys.”',
        '1. “But cleaning up is so boring!”',
        "2. “I'd love to, Dad, but Nibbles wants to be a rock star.”",
        '3. “I was doing that, but a stegosaurus went stomping through the house.”',
        "4. “It's already done. Everything is spick and span!”",
        '> ',
      ],
      'en',
    );
    expect(chips.map((chip) => chip.send)).toEqual(['1', '2', '3', '4']);
    expect(chips.map((chip) => chip.detail)).toEqual([
      'But cleaning up is so',
      "I'd love",
      'I was doing that',
      "It's already done",
    ]);
  });

  it('accepts "1)" and "(1)", and one line asking for the choice after the list', () => {
    expect(labels(['1) North', '2) South'])).toEqual(['1', '2']);
    expect(labels(['(1) Story mode', '(2) Puzzle mode', '(3) Quit', 'Which one?', '>'])).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(labels(['How will you signal?', '1. Wave', '2. Ring', '3. Flare', 'Choose:'])).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('needs a list from 1, in order, at least two items, at the end of the text', () => {
    expect(numberedOptions(['1. Only one'])).toBeNull();
    expect(numberedOptions(['1. One', '3. Three'])).toBeNull();
    expect(numberedOptions(['2. Two', '3. Three'])).toBeNull();
    expect(
      numberedOptions(['1. One', '2. Two', 'You are in a long corridor with doors.']),
    ).toBeNull();
    // A list in the middle of the turn, followed by more text.
    expect(
      labels(['1. One', '2. Two', 'The rest of a long paragraph that goes on and on.', '>']),
    ).toEqual([]);
    // Years and amounts are not options.
    expect(labels(['1984 was a good year.', '2001 was too.'])).toEqual([]);
  });

  it('keeps at most nine options', () => {
    const list = [];
    for (let i = 1; i <= 12; i++) list.push(i + '. Option ' + i);
    expect(findAnswers(list, 'en')).toHaveLength(MAX_OPTIONS);
  });

  it('prefers the numbered list to a yes/no question', () => {
    expect(labels(['Do you want to signal?', '1. Wave', '2. Ring', '> '])).toEqual(['1', '2']);
  });
});
