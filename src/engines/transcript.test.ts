import { describe, expect, it } from 'vitest';
import { statusRows } from './transcript';

describe('statusRows', () => {
  it('splits every row into left and right parts and drops blank rows', () => {
    const rows = statusRows([
      ' Drawbridge                                   N   ',
      '                                                  ',
      ' Great Outdoors                            W  O  E',
      ' Rooms searched: 0/55',
    ]);
    expect(rows.shown).toEqual([
      { left: 'Drawbridge', right: 'N' },
      { left: 'Great Outdoors', right: 'W  O  E' },
      { left: 'Rooms searched: 0/55', right: '' },
    ]);
    expect(rows.overflow).toBe(false);
    expect(rows.all).toEqual(rows.shown);
  });

  it('shows one row as before, and nothing for an empty window', () => {
    expect(statusRows(['  West of House            Turns: 12   ']).shown).toEqual([
      { left: 'West of House', right: 'Turns: 12' },
    ]);
    expect(statusRows([]).shown).toEqual([]);
    expect(statusRows(['   ', '']).shown).toEqual([]);
  });

  it('keeps max - 1 rows past the cap and flags the overflow', () => {
    const status = ['One', 'Two', 'Three', 'Four', 'Five'];
    const rows = statusRows(status, 4);
    expect(rows.shown.map((row) => row.left)).toEqual(['One', 'Two', 'Three']);
    expect(rows.overflow).toBe(true);
    expect(rows.all.map((row) => row.left)).toEqual(status);
    // Exactly at the cap: everything shows.
    expect(statusRows(status.slice(0, 4), 4)).toMatchObject({ overflow: false });
    expect(statusRows(status.slice(0, 4), 4).shown).toHaveLength(4);
  });
});
