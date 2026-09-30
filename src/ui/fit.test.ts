import { describe, expect, it } from 'vitest';
import { fitCount } from './fit';

describe('fitCount', () => {
  it('keeps every item when they all fit next to the reserved one', () => {
    // 50 + 6 + 50 + 6 + 50 + 6 + 48 = 216
    expect(fitCount([50, 50, 50], 216, 48)).toBe(3);
  });

  it('drops items from the end when the row is too narrow', () => {
    expect(fitCount([50, 50, 50], 215, 48)).toBe(2);
    expect(fitCount([50, 50, 50], 100, 48)).toBe(0);
  });

  it('keeps order: a later short item is not promoted over an earlier long one', () => {
    expect(fitCount([200, 20], 150, 0)).toBe(0);
  });

  it('works without a reserved item', () => {
    expect(fitCount([50, 50], 106, 0)).toBe(2);
    expect(fitCount([50, 50], 105, 0)).toBe(1);
  });

  it('honours the minimum, capped by the number of items', () => {
    expect(fitCount([500], 100, 48, 6, 1)).toBe(1);
    expect(fitCount([], 100, 48, 6, 1)).toBe(0);
  });
});
