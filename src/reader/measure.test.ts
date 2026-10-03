import { describe, expect, it } from 'vitest';
import { lineStartCandidates } from './measure';

/** The text from each candidate line start. */
const from = (text: string) => lineStartCandidates(text).map((i) => text.slice(i));

describe('line start candidates (S1.18)', () => {
  it('starts at words, never on the spaces the game printed', () => {
    // Leading spaces (9:05's "  -----"), double spaces after a full stop (Violet), a long run of spaces.
    expect(lineStartCandidates('  -----')).toEqual([2]);
    expect(lineStartCandidates('Calm down.  All you')).toEqual([0, 5, 12, 16]);
    expect(lineStartCandidates('a' + ' '.repeat(40) + 'b')).toEqual([0, 41]);
    expect(lineStartCandidates('   ')).toEqual([]);
  });

  it('also starts after a hyphen inside a word, where the browser breaks lines too', () => {
    expect(from('or maybe verb-noun-preposition-noun.')).toEqual([
      'or maybe verb-noun-preposition-noun.',
      'maybe verb-noun-preposition-noun.',
      'verb-noun-preposition-noun.',
      'noun-preposition-noun.',
      'preposition-noun.',
      'noun.',
    ]);
    // A run of dashes stays one segment; a dash between spaces is a word of its own.
    expect(from('A N C H O R — H E A D')).toContain('— H E A D');
    expect(lineStartCandidates('-----')).toEqual([0]);
  });
});
