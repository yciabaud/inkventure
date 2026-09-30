import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n/i18n';
import type { IndexRow } from './emitter';
import {
  buildFeatured,
  curatedProblems,
  featuredProblems,
  MAX_PITCH_LENGTH,
  TOP_RATED_COUNT,
  type CatalogView,
  type CuratedFile,
  type CuratedItem,
} from './featured';
import { uiLocales } from './locales';
import type { ContentPolicyConfig } from './resolver';

const locales = ['en', 'fr'];
const pitch = { en: 'An English pitch.', fr: 'Un pitch en français.' };
const noPolicy: ContentPolicyConfig = { denyTags: ['adult'], exclude: [] };

function row(t: string, extra: Partial<IndexRow> = {}): IndexRow {
  return { t: t, n: 'Game ' + t, a: 'Someone', f: 'zcode', l: 'en', ...extra };
}

function catalog(rows: IndexRow[], tags: Record<string, string[]> = {}): CatalogView {
  return {
    policy: 'general',
    rows: rows,
    tags: (tuid) => (rows.some((r) => r.t === tuid) ? tags[tuid] || [] : undefined),
  };
}

function curated(...items: CuratedItem[]): CuratedFile {
  return { version: 1, items: items };
}

describe('curatedProblems', () => {
  it('accepts a valid file', () => {
    expect(curatedProblems(curated({ tuid: 'a1', starter: true, pitch: pitch }), locales)).toEqual(
      [],
    );
  });

  it('reports the version, keys, TUIDs and duplicates', () => {
    expect(curatedProblems({ items: [] }, locales)).toEqual(['version: 1 expected']);
    expect(curatedProblems({ version: 1 }, locales)).toEqual(['items: array expected']);
    expect(
      curatedProblems(
        {
          version: 1,
          items: [
            { tuid: 'a1', pitch: pitch, note: 'x' },
            { tuid: 'A-1', pitch: pitch, starter: 'yes' },
            { tuid: 'a1', pitch: pitch },
          ],
        },
        locales,
      ),
    ).toEqual([
      'items[0]: unknown key note',
      'items[1]: tuid expected',
      'items[1]: starter must be true or false',
      'items[2]: duplicate a1',
    ]);
  });

  it('needs a one-line pitch for every UI locale and no other', () => {
    expect(
      curatedProblems(
        curated(
          { tuid: 'a1', pitch: { en: 'Only English.' } },
          { tuid: 'a2', pitch: { en: ' ', fr: 'x'.repeat(MAX_PITCH_LENGTH + 1) } },
          { tuid: 'a3', pitch: { en: 'Two\nlines.', fr: 'Oui.', de: 'Ja.' } },
        ),
        locales,
      ),
    ).toEqual([
      'items[0]: pitch.fr missing',
      'items[1]: pitch.en missing',
      `items[1]: pitch.fr longer than ${MAX_PITCH_LENGTH} characters`,
      'items[2]: pitch.en on several lines',
      'items[2]: pitch.de is not a UI locale',
    ]);
    expect(curatedProblems(curated({ tuid: 'a1' } as CuratedItem), locales)).toEqual([
      'items[0]: pitch expected',
    ]);
  });
});

describe('featuredProblems', () => {
  const games = catalog(
    [
      row('en1'),
      row('fr1', { l: 'fr' }),
      row('es1', { l: 'es' }),
      row('adu1'),
      row('und1', { l: undefined }),
    ],
    { adu1: ['Parser', 'ADULT'] },
  );

  it('accepts curated games that are in the catalogue, in a UI locale', () => {
    const file = curated({ tuid: 'en1', pitch: pitch }, { tuid: 'fr1', pitch: pitch });
    expect(featuredProblems(file, games, noPolicy, locales)).toEqual([]);
  });

  it('reports an unknown (or unplayable) TUID', () => {
    expect(
      featuredProblems(curated({ tuid: 'zz9', pitch: pitch }), games, noPolicy, locales),
    ).toEqual(['items[0] zz9: not in the catalogue (unknown or not playable)']);
  });

  it('reports excluded and adult games', () => {
    const policy = { denyTags: ['adult'], exclude: [{ tuid: 'en1', reason: 'broken file' }] };
    expect(
      featuredProblems(
        curated({ tuid: 'en1', pitch: pitch }, { tuid: 'adu1', pitch: pitch }),
        games,
        policy,
        locales,
      ),
    ).toEqual([
      'items[0] en1: excluded (broken file)',
      'items[1] adu1: adult content (tag "ADULT")',
    ]);
    // Adult tags only matter under the general policy.
    expect(
      featuredProblems(
        curated({ tuid: 'adu1', pitch: pitch }),
        { ...games, policy: 'adult' },
        noPolicy,
        locales,
      ),
    ).toEqual([]);
  });

  it('reports games in a language no UI locale shows', () => {
    expect(
      featuredProblems(
        curated({ tuid: 'es1', pitch: pitch }, { tuid: 'und1', pitch: pitch }),
        games,
        noPolicy,
        locales,
      ),
    ).toEqual([
      'items[0] es1: in language "es", not a UI locale: never shown',
      'items[1] und1: in language "und", not a UI locale: never shown',
    ]);
  });

  it('reports a missing locale before looking at the catalogue', () => {
    expect(
      featuredProblems(curated({ tuid: 'zz9', pitch: { en: 'Hi.' } }), games, noPolicy, locales),
    ).toEqual(['items[0]: pitch.fr missing']);
  });
});

describe('buildFeatured', () => {
  it('lists the curated games of each language first, then the best rated in that language', () => {
    const games = catalog([
      row('en1', { r: 3.5, rc: 40, s: 3.4 }),
      row('en2', { r: 4.5, rc: 100, s: 4.4 }),
      row('en3', { r: 4.8, rc: 2, s: 3.9 }),
      row('en4', { r: 2.9, rc: 50, s: 2.8 }),
      row('en5'),
      row('fr1', { l: 'fr', r: 4, rc: 3, s: 3 }),
      row('fr2', { l: 'fr', r: 5, rc: 1, s: 2.4 }),
      row('es1', { l: 'es', r: 5, rc: 90, s: 4.9 }),
    ]);
    const { file, skipped } = buildFeatured(
      curated(
        { tuid: 'en1', starter: true, pitch: pitch },
        { tuid: 'fr2', pitch: pitch },
        { tuid: 'gone', pitch: pitch },
      ),
      games,
      noPolicy,
      locales,
      '2026-09-30T00:00:00.000Z',
    );
    expect(skipped).toEqual(['gone: not in the catalogue (unknown or not playable)']);
    expect(file.version).toBe(1);
    expect(file.built).toBe('2026-09-30T00:00:00.000Z');
    const en = file.locales.en;
    // Curated first (not repeated among the best rated); below 3 stars or unrated left out; Spanish in neither.
    expect(en.map((g) => g.t)).toEqual(['en1', 'en2', 'en3']);
    expect(en[0]).toEqual({ ...games.rows[0], pi: pitch.en, st: 1 });
    expect(en[1]).toEqual(games.rows[1]);
    expect(file.locales.fr.map((g) => g.t)).toEqual(['fr2', 'fr1']);
    expect(file.locales.fr[0].pi).toBe(pitch.fr);
    expect(file.locales.fr[0].st).toBeUndefined();
  });

  it('keeps at most TOP_RATED_COUNT best-rated games per locale', () => {
    const rows: IndexRow[] = [];
    for (let i = 0; i < TOP_RATED_COUNT + 5; i++) rows.push(row('g' + i, { r: 4, rc: 10, s: i }));
    const { file } = buildFeatured(curated(), catalog(rows), noPolicy, locales, 'x');
    expect(file.locales.en).toHaveLength(TOP_RATED_COUNT);
    expect(file.locales.en[0].t).toBe('g' + (TOP_RATED_COUNT + 4));
    expect(file.locales.fr).toEqual([]);
  });
});

describe('content/featured.json', () => {
  it('is valid for the app locales (the CI step also checks it against the published catalogue)', () => {
    expect(uiLocales()).toEqual(LOCALES.slice().sort());
    const content = JSON.parse(readFileSync('content/featured.json', 'utf8')) as unknown;
    expect(curatedProblems(content, uiLocales())).toEqual([]);
  });
});
