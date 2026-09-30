import { describe, expect, it } from 'vitest';
import { CAPTION_HEIGHT, gridLayout, listPerPage } from './layout';

describe('library layout', () => {
  it('fits list rows in the height, at least three', () => {
    expect(listPerPage(470)).toBe(8);
    expect(listPerPage(100)).toBe(3);
  });

  it('lays covers and their titles out in columns of at least 120 px and as many rows as fit', () => {
    // A 600 × 800 e-reader: the list area is about 568 × 480; covers shrink a little to fit two rows of titles.
    expect(gridLayout(568, 480)).toEqual({
      columns: 4,
      rows: 2,
      coverWidth: 130,
      coverHeight: 196,
      perPage: 8,
    });
    // A large e-reader.
    expect(gridLayout(1040, 1100)).toMatchObject({ columns: 7, rows: 4, perPage: 28 });
  });

  it('shrinks covers to keep two rows on a short, narrow screen', () => {
    const phone = gridLayout(328, 400);
    expect(phone).toMatchObject({ columns: 2, rows: 2, perPage: 4 });
    expect(2 * (phone.coverHeight + CAPTION_HEIGHT) + 12).toBeLessThanOrEqual(400);
    expect(phone.columns * phone.coverWidth + 12).toBeLessThanOrEqual(328);
  });
});
