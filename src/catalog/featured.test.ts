import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_GAP,
  CARD_TEXT_HEIGHT,
  COMPACT_TEXT_HEIGHT,
  featuredFor,
  loadFeatured,
  MAX_COVER_HEIGHT,
  MIN_CARD_WIDTH,
  MIN_COVER_HEIGHT,
  resetFeatured,
  shelfLayout,
  type FeaturedFile,
  type FeaturedRow,
} from './featured';

function row(t: string, extra: Partial<FeaturedRow> = {}): FeaturedRow {
  return { t: t, n: 'Game ' + t, a: 'Someone', f: 'zcode', ...extra };
}

const file: FeaturedFile = {
  version: 1,
  built: 'x',
  locales: {
    en: [row('a', { pi: 'Pitch A', st: 1 }), row('b'), row('c'), row('d'), row('e')],
    fr: [row('f', { pi: 'Pitch F' })],
  },
};

describe('featuredFor', () => {
  it('keeps the list of the locale in order, without the games in progress', () => {
    const inProgress = (tuid: string) => tuid === 'b' || tuid === 'd';
    expect(featuredFor(file, 'en', inProgress).map((g) => g.t)).toEqual(['a', 'c', 'e']);
    expect(featuredFor(file, 'en', () => false)[0].pi).toBe('Pitch A');
    expect(featuredFor(file, 'fr', inProgress).map((g) => g.t)).toEqual(['f']);
  });

  it('shows nothing for a locale without a list, and at most `max` games', () => {
    expect(featuredFor(file, 'de', () => false)).toEqual([]);
    expect(featuredFor(file, 'en', (t) => t === 'a', 2).map((g) => g.t)).toEqual(['b', 'c']);
    expect(featuredFor(file, 'en', () => true)).toEqual([]);
  });
});

describe('shelfLayout', () => {
  it('makes covers as tall as the row allows, within bounds', () => {
    expect(shelfLayout(604, 1000).coverHeight).toBe(MAX_COVER_HEIGHT);
    expect(shelfLayout(604, CARD_TEXT_HEIGHT + 150).coverHeight).toBe(150);
    expect(shelfLayout(604, 100).coverHeight).toBe(MIN_COVER_HEIGHT);
    expect(shelfLayout(604, CARD_TEXT_HEIGHT + 150).coverWidth).toBe(100);
  });

  it('puts as many cards per page as fit, at least one, never narrower than the text needs', () => {
    // 250 px tall covers are 166 px wide: (604 + 16) / (166 + 16) = 3.4.
    expect(shelfLayout(604, 1000)).toEqual({
      perPage: 3,
      cardWidth: 166,
      coverWidth: 166,
      coverHeight: MAX_COVER_HEIGHT,
    });
    expect(shelfLayout(604, 250).coverHeight).toBe(250 - CARD_TEXT_HEIGHT);
    expect(shelfLayout(604, 250, true).coverHeight).toBe(250 - COMPACT_TEXT_HEIGHT);
    const small = shelfLayout(328, 200);
    expect(small.cardWidth).toBe(MIN_CARD_WIDTH);
    expect(small.perPage).toBe(Math.floor((328 + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
    expect(shelfLayout(50, 1000).perPage).toBe(1);
  });
});

describe('loadFeatured', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFeatured();
  });

  function serve(responses: Array<{ status: number; body: string }>) {
    const requested: string[] = [];
    class FakeXhr {
      readyState = 0;
      status = 0;
      responseText = '';
      onreadystatechange: (() => void) | null = null;
      private url = '';
      open(_method: string, url: string) {
        this.url = url;
      }
      send() {
        requested.push(this.url);
        const response = responses.shift()!;
        setTimeout(() => {
          this.readyState = 4;
          this.status = response.status;
          this.responseText = response.body;
          if (this.onreadystatechange) this.onreadystatechange();
        }, 0);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    return requested;
  }

  it('loads catalog/featured.json once', async () => {
    const requested = serve([{ status: 200, body: JSON.stringify(file) }]);
    expect(await loadFeatured()).toEqual(file);
    expect(await loadFeatured()).toEqual(file);
    expect(requested).toEqual(['catalog/featured.json']);
  });

  it('refuses another version, and tries again after a failure', async () => {
    const requested = serve([
      { status: 200, body: JSON.stringify({ ...file, version: 2 }) },
      { status: 200, body: JSON.stringify(file) },
    ]);
    await expect(loadFeatured()).rejects.toThrow('Unsupported featured lists');
    expect(await loadFeatured()).toEqual(file);
    expect(requested).toHaveLength(2);
  });
});
