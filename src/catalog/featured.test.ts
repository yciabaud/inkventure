import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  featuredFor,
  loadFeatured,
  resetFeatured,
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
