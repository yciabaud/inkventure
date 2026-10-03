import { describe, expect, it } from 'vitest';
import { PHRASE_TABLES, phrases, wordPattern } from './phrases';
import { GAME_LANGUAGES } from './verbs';

describe('phrase tables', () => {
  it('has one table per game language, with Yes / No and the words of a list', () => {
    expect(PHRASE_TABLES.map((t) => t.language)).toEqual(GAME_LANGUAGES);
    for (const table of PHRASE_TABLES) {
      expect(table.yesNo).toHaveLength(2);
      expect(table.or.length).toBeGreaterThan(0);
      expect(table.determiners.length).toBeGreaterThan(0);
      expect(table.cues.length).toBeGreaterThan(0);
    }
  });

  it('knows the Inform library questions in the verified languages', () => {
    for (const table of PHRASE_TABLES.filter((t) => t.verified)) {
      expect(table.whichStarts.length).toBeGreaterThan(0);
      expect(table.whatStarts.length + table.vagueStarts.length).toBeGreaterThan(0);
    }
  });

  it('adds the English words a game prints as they are, not English grammar', () => {
    const fr = phrases('fr');
    expect(fr.yesNo[0][0]).toBe('Oui');
    expect(fr.meta).toEqual(expect.arrayContaining(['AIDE', 'HELP']));
    expect(fr.whichStarts).toEqual(expect.arrayContaining(['précisez', 'which do you mean']));
    expect(fr.auxiliaries).toEqual([]);
    expect(phrases('de').auxiliaries).not.toContain('was');
    expect(fr.determiners).not.toContain('the');
    expect(phrases('en')).toBe(PHRASE_TABLES[0]);
  });

  it('matches whole words, accented letters included', () => {
    const pattern = wordPattern(['précisez']);
    expect(pattern.test('Précisez : le ciré')).toBe(true);
    expect(pattern.test('imprécisez')).toBe(false);
    expect(wordPattern([]).test('anything')).toBe(false);
  });
});
