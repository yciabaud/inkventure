import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, loadCatalog, resetCatalog, type IndexRow } from './loader';
import { normalize, paginate, search, searchKey } from './search';

function row(t: string, n: string, a = 'Someone'): IndexRow {
  return { t: t, n: n, a: a, f: 'zcode' };
}

describe('normalize', () => {
  it('lowers case, folds accents and ligatures, and turns punctuation into single spaces', () => {
    expect(normalize('  Écho de la Forêt ')).toBe('echo de la foret');
    expect(normalize('Zoë Œuvre — Straße!')).toBe('zoe oeuvre strasse');
    expect(normalize("L'Île-aux-Moines")).toBe('l ile aux moines');
  });

  it('keeps characters it cannot fold', () => {
    expect(normalize('Приключение 冒险')).toBe('приключение 冒险');
  });
});

describe('search', () => {
  const rows = [
    row('a', 'The Lamp at Saltmere', 'Inkventure Fixtures'),
    row('b', 'Lanterns', 'Émile Lampert'),
    row('c', 'Café de la Forêt', 'Zoë'),
    row('d', 'Hollow Mountain', 'D. Placeholder'),
  ];
  const keys = rows.map(searchKey);
  const titles = (query: string) => search(rows, keys, query).map((i) => rows[i].n);

  it('matches the start of words in the title or author, ignoring case and accents', () => {
    expect(titles('lamp')).toEqual(['The Lamp at Saltmere', 'Lanterns']);
    expect(titles('CAFE foret')).toEqual(['Café de la Forêt']);
    expect(titles('zoe')).toEqual(['Café de la Forêt']);
    expect(titles('amp')).toEqual([]);
  });

  it('needs every word, and lists title matches before author-only ones', () => {
    expect(titles('lamp saltmere')).toEqual(['The Lamp at Saltmere']);
    expect(titles('emile')).toEqual(['Lanterns']);
    expect(titles('la')).toEqual(['The Lamp at Saltmere', 'Lanterns', 'Café de la Forêt']);
  });

  it('returns everything, in index order, for an empty query', () => {
    expect(search(rows, keys, '  ')).toEqual([0, 1, 2, 3]);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it('slices pages and counts them', () => {
    expect(paginate(items, 1, 10)).toEqual({
      items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      page: 1,
      pageCount: 3,
    });
    expect(paginate(items, 3, 10).items).toEqual([20, 21, 22]);
  });

  it('clamps the page, and has one (empty) page without items', () => {
    expect(paginate(items, 9, 10).page).toBe(3);
    expect(paginate(items, NaN, 10).page).toBe(1);
    expect(paginate([], 2, 10)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});

/** A fake XMLHttpRequest answering from `files` (path → status and body). */
function fakeXhr(files: Record<string, { status: number; body: string }>) {
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
      const file = files[this.url] || { status: 404, body: '' };
      setTimeout(() => {
        this.readyState = 4;
        this.status = file.status;
        this.responseText = file.body;
        if (this.onreadystatechange) this.onreadystatechange();
      }, 0);
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return requested;
}

const meta = {
  version: 1,
  built: 'x',
  policy: 'general',
  count: 3,
  shards: ['index-0.json', 'index-1.json'],
  facets: {},
};
const files = {
  'catalog/meta.json': { status: 200, body: JSON.stringify(meta) },
  'catalog/index-0.json': {
    status: 200,
    body: JSON.stringify({ rows: [row('a', 'Alpha'), row('b', 'Beta')] }),
  },
  'catalog/index-1.json': { status: 200, body: JSON.stringify({ rows: [row('c', 'Gamma')] }) },
};

describe('loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCatalog();
  });

  it('loads meta.json then every shard in order, reporting progress', async () => {
    const requested = fakeXhr(files);
    const progress: string[] = [];
    const catalog = await fetchCatalog('catalog/', (loaded, total) =>
      progress.push(loaded + '/' + total),
    );
    expect(requested).toEqual([
      'catalog/meta.json',
      'catalog/index-0.json',
      'catalog/index-1.json',
      'catalog/featured.json',
    ]);
    expect(catalog.rows.map((r) => r.t)).toEqual(['a', 'b', 'c']);
    expect(catalog.rows.filter((r) => r.st)).toEqual([]);
    expect(catalog.keys[0]).toBe(' alpha someone ');
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
  });

  it('flags the starters of featured.json, in every locale', async () => {
    const featured = {
      version: 1,
      built: 'x',
      locales: { en: [{ t: 'a', st: 1 }, { t: 'b' }], fr: [{ t: 'c', st: 1 }] },
    };
    fakeXhr({ ...files, 'catalog/featured.json': { status: 200, body: JSON.stringify(featured) } });
    const catalog = await fetchCatalog();
    expect(catalog.rows.map((r) => r.st)).toEqual([1, undefined, 1]);
  });

  it('fails on a missing shard, an unsupported version or invalid JSON', async () => {
    fakeXhr({ ...files, 'catalog/index-1.json': { status: 404, body: '' } });
    await expect(fetchCatalog()).rejects.toThrow('HTTP 404 for catalog/index-1.json');
    fakeXhr({
      'catalog/meta.json': { status: 200, body: JSON.stringify({ ...meta, version: 2 }) },
    });
    await expect(fetchCatalog()).rejects.toThrow('Unsupported catalogue');
    fakeXhr({ 'catalog/meta.json': { status: 200, body: '{' } });
    await expect(fetchCatalog()).rejects.toThrow('Invalid JSON');
  });

  it('loads once per session, and again after a failure', async () => {
    fakeXhr({ 'catalog/meta.json': { status: 500, body: '' } });
    await expect(loadCatalog()).rejects.toThrow();
    const requested = fakeXhr(files);
    const [first, second] = await Promise.all([loadCatalog(), loadCatalog()]);
    expect(first).toBe(second);
    await loadCatalog();
    expect(requested.filter((url) => url === 'catalog/meta.json')).toHaveLength(1);
  });
});
