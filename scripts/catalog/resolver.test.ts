import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crawl, type RecordCache } from './crawler';
import { offlineFetcher } from './fetcher';
import type { GameRecord } from './ifdb';
import {
  chooseFile,
  decodeEntities,
  linkFormat,
  normalizeGenres,
  normalizeLanguage,
  policyReason,
  resolve,
  secureUrl,
  urlsToCheck,
  yearOf,
  type ContentPolicyConfig,
} from './resolver';

const A = 'https://ifarchive.org/if-archive/games/';
const CONFIG: ContentPolicyConfig = {
  denyTags: ['sexual content', 'nsfw'],
  exclude: [{ tuid: 'fxexcl0000000011', reason: 'Crashes on load' }],
};

type Link = {
  url: string;
  format?: string;
  isGame?: boolean;
  compression?: string;
  compressedPrimary?: string;
};
function record(links: Link[], extra: Partial<GameRecord['ifdb']> = {}): GameRecord {
  return {
    ifdb: { tuid: 't', pageversion: 1, downloads: { links: links }, ...extra },
  } as GameRecord;
}

describe('format detection', () => {
  it('maps IFDB format ids, marking blorbs', () => {
    expect(linkFormat({ url: A + 'x.z5', format: 'zcode' }, 'Inform 6')).toEqual({
      format: 'zcode',
      blorb: false,
    });
    expect(linkFormat({ url: A + 'x.zblorb', format: 'blorb/zcode' }, '')).toEqual({
      format: 'zcode',
      blorb: true,
    });
    expect(linkFormat({ url: A + 'x.gblorb', format: 'blorb/glulx' }, '')).toEqual({
      format: 'glulx',
      blorb: true,
    });
  });

  it('falls back on the file name, including the story file inside a zip', () => {
    expect(linkFormat({ url: A + 'x.z8' }, '')).toEqual({ format: 'zcode', blorb: false });
    expect(linkFormat({ url: A + 'x.ulx?download' }, '')).toEqual({
      format: 'glulx',
      blorb: false,
    });
    expect(linkFormat({ url: A + 'x.zip', compressedPrimary: 'x/X.Z3' }, '')!.format).toBe('zcode');
  });

  it('recognises Twine HTML and compiled ink by development system', () => {
    const html = { url: A + 'story.html', format: 'hypertextgame' };
    expect(linkFormat(html, 'Twine 2 (SugarCube)')!.format).toBe('twine');
    expect(linkFormat(html, 'Custom JavaScript')).toBeUndefined();
    expect(linkFormat({ url: A + 'story.json' }, 'ink')!.format).toBe('ink');
    expect(linkFormat({ url: A + 'story.zip', format: 'hypertextgame' }, 'ink')).toBeUndefined();
    expect(linkFormat({ url: A + 'game.t3', format: 'tads3' }, 'TADS 3')).toBeUndefined();
  });

  it('upgrades IF Archive links to HTTPS and refuses other plain HTTP links', () => {
    expect(secureUrl('http://mirror.ifarchive.org/a.z5')).toBe('https://mirror.ifarchive.org/a.z5');
    expect(secureUrl('https://example.com/a.z5')).toBe('https://example.com/a.z5');
    expect(secureUrl('http://example.com/a.z5')).toBeUndefined();
  });
});

describe('file selection', () => {
  const zcode = ['zcode' as const];

  it('prefers the IF Archive, then an uncompressed file, then a blorb, then IFDB order', () => {
    const choice = chooseFile(
      record([
        { url: 'https://example.com/a.zblorb', format: 'blorb/zcode', isGame: true },
        {
          url: A + 'a.zip',
          format: 'zcode',
          isGame: true,
          compression: 'zip',
          compressedPrimary: 'a.z5',
        },
        { url: A + 'a.z5', format: 'zcode', isGame: true },
        { url: A + 'a.zblorb', format: 'blorb/zcode', isGame: true },
      ]),
      '',
      zcode,
    );
    expect('file' in choice && choice.file.file.url).toBe(A + 'a.zblorb');
  });

  it('uses a file outside the IF Archive only when the app can read it (CORS)', () => {
    const other = 'https://example.com/a.z5';
    const mirror = 'https://mirror.example.org/a.zblorb';
    const links = [
      { url: other, format: 'zcode', isGame: true },
      { url: mirror, format: 'blorb/zcode', isGame: true },
    ];
    expect(urlsToCheck(record(links), '', zcode)).toEqual([mirror, other]);
    const pick = (readable: string[]) =>
      chooseFile(record(links), '', zcode, (url) => readable.indexOf(url) >= 0);
    expect(pick([mirror, other])).toMatchObject({ file: { file: { url: mirror } } });
    expect(pick([other])).toMatchObject({ file: { file: { url: other } } });
    expect(pick([])).toEqual({ reason: 'unreadable-host', detail: mirror });

    // An IF Archive file needs no check.
    const withArchive = links.concat([{ url: A + 'a.z5', format: 'zcode', isGame: true }]);
    expect(urlsToCheck(record(withArchive), '', zcode)).toEqual([]);
    expect(chooseFile(record(withArchive), '', zcode, () => false)).toMatchObject({
      file: { file: { url: A + 'a.z5' } },
    });
  });

  it('takes the first enabled format in order', () => {
    const links = [
      { url: A + 'a.ulx', format: 'glulx', isGame: true },
      { url: A + 'a.z8', format: 'zcode', isGame: true },
    ];
    const choice = chooseFile(record(links), '', ['zcode', 'glulx']);
    expect('file' in choice && choice.file.format).toBe('zcode');
  });

  it('uses a zip only when IFDB names the story file inside it', () => {
    const named = chooseFile(
      record([
        {
          url: A + 'a.zip',
          format: 'zcode',
          isGame: true,
          compression: 'zip',
          compressedPrimary: 'a/A.Z5',
        },
      ]),
      '',
      zcode,
    );
    expect('file' in named && named.file.file.archive).toEqual({ type: 'zip', primary: 'a/A.Z5' });
    const unnamed = chooseFile(
      record([{ url: A + 'a.zip', format: 'zcode', isGame: true, compression: 'zip' }]),
      '',
      zcode,
    );
    expect(unnamed).toEqual({ reason: 'compressed-no-primary', detail: A + 'a.zip' });
    const tarball = chooseFile(
      record([
        {
          url: A + 'a.tgz',
          format: 'zcode',
          isGame: true,
          compression: 'tar.gz',
          compressedPrimary: 'a.z5',
        },
      ]),
      '',
      zcode,
    );
    expect('reason' in tarball && tarball.reason).toBe('compressed-no-primary');
  });

  it('gives the reason when no file can be played', () => {
    expect(chooseFile(record([]), '', zcode)).toEqual({ reason: 'no-game-file' });
    expect(chooseFile(record([{ url: A + 'walkthrough.txt', format: 'text' }]), '', zcode)).toEqual(
      {
        reason: 'no-game-file',
      },
    );
    expect(
      chooseFile(record([{ url: A + 'g.gam', format: 'tads2', isGame: true }]), '', zcode),
    ).toEqual({
      reason: 'unsupported-format',
      detail: 'tads2',
    });
    expect(
      chooseFile(record([{ url: A + 'g.ulx', format: 'glulx', isGame: true }]), '', zcode),
    ).toEqual({
      reason: 'format-not-enabled',
      detail: 'glulx',
    });
    expect(
      chooseFile(
        record([{ url: 'http://example.com/g.z5', format: 'zcode', isGame: true }]),
        '',
        zcode,
      ),
    ).toEqual({
      reason: 'insecure-url',
      detail: 'http://example.com/g.z5',
    });
  });
});

describe('metadata', () => {
  it('normalises languages to their primary subtag', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('fr')).toBe('fr');
    expect(normalizeLanguage('English')).toBe('en');
    expect(normalizeLanguage('Français')).toBe('fr');
    expect(normalizeLanguage('German (de-DE)')).toBe('de');
    expect(normalizeLanguage('es, en')).toBe('es');
    // Seen on IFDB: several languages, their codes together in brackets; the first is the main one.
    expect(normalizeLanguage('Castilian, English (es, en)')).toBe('es');
    expect(normalizeLanguage('German, English, Castilian (de, en, es)')).toBe('de');
    expect(normalizeLanguage('English, Russian, Belarusian (en, ru, be)')).toBe('en');
    expect(normalizeLanguage('zh-Hans')).toBe('zh');
    expect(normalizeLanguage('es-AR')).toBe('es');
    expect(normalizeLanguage('Klingon')).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });

  it('decodes the HTML entities IFDB leaves in titles and authors', () => {
    expect(decodeEntities('Lock &amp; Key')).toBe('Lock & Key');
    expect(decodeEntities('&quot;Calm, Mute, Moving&quot; &gt; by @')).toBe(
      '"Calm, Mute, Moving" > by @',
    );
    expect(decodeEntities('Caf&#233; &#x2014; ok &unknown; & alone')).toBe(
      'Café — ok &unknown; & alone',
    );
  });

  it('splits genres and reads years', () => {
    expect(normalizeGenres('Fantasy / Humor, Fantasy')).toEqual(['Fantasy', 'Humor']);
    expect(normalizeGenres('')).toEqual([]);
    expect(yearOf('2019-05-04')).toBe(2019);
    expect(yearOf('1985')).toBe(1985);
    expect(yearOf(undefined)).toBeUndefined();
  });
});

describe('content policy', () => {
  it('drops games with a denied tag, whatever its case, in a general build only', () => {
    expect(policyReason('a', ['Romance', 'NSFW'], 'general', CONFIG)).toEqual({
      reason: 'adult-content',
      detail: 'NSFW',
    });
    expect(policyReason('a', ['NSFW'], 'adult', CONFIG)).toBeUndefined();
    expect(policyReason('a', ['sexuality'], 'general', CONFIG)).toBeUndefined();
  });

  it('applies the manual exclude list under every policy', () => {
    const excluded = { reason: 'excluded', detail: 'Crashes on load' };
    expect(policyReason('fxexcl0000000011', [], 'general', CONFIG)).toEqual(excluded);
    expect(policyReason('fxexcl0000000011', [], 'adult', CONFIG)).toEqual(excluded);
  });
});

describe('resolution of the recorded fixtures', () => {
  const memory = (): RecordCache => {
    const map = new Map();
    return { get: (tuid) => map.get(tuid), set: (entry) => map.set(entry.tuid, entry) };
  };
  const queries = (
    JSON.parse(readFileSync('scripts/catalog/queries.json', 'utf8')) as { queries: string[] }
  ).queries;
  const raw = () =>
    crawl(offlineFetcher('tests/fixtures/ifdb'), queries, memory(), new Date('2026-09-30'));

  it('keeps only playable games with a supported HTTPS file, and gives a reason for every other game', async () => {
    const { dataset } = await raw();
    const result = resolve(dataset, {
      enabledFormats: ['zcode'],
      policy: 'general',
      config: CONFIG,
    });
    expect(result.games.map((game) => game.tuid)).toEqual([
      'fxcave0000000003',
      'fxlamp0000000001',
      'fxzork0000000005',
    ]);
    for (const game of result.games) {
      expect(game.format).toBe('zcode');
      expect(game.file.url).toMatch(/^https:\/\/(www\.)?ifarchive\.org\//);
    }
    expect(Object.fromEntries(result.dropped.map((d) => [d.tuid, d.reason]))).toEqual({
      fxadlt0000000008: 'adult-content',
      fxbell0000000002: 'format-not-enabled',
      fxexcl0000000011: 'excluded',
      fxhttp0000000010: 'insecure-url',
      fxinky0000000007: 'unsupported-format',
      fxnofl0000000009: 'no-game-file',
      fxtwin0000000006: 'format-not-enabled',
    });
    expect(result.games.length + result.dropped.length).toBe(dataset.games.length);
    // Games the policy removes are not counted.
    expect(result.counts.formats).toEqual({ zcode: 3, glulx: 1, twine: 1 });
  });

  it('fills the metadata the index needs', async () => {
    const { dataset } = await raw();
    const result = resolve(dataset, {
      enabledFormats: ['zcode'],
      policy: 'general',
      config: CONFIG,
    });
    const zork = result.games.filter((game) => game.tuid === 'fxzork0000000005')[0];
    expect(zork).toMatchObject({
      title: 'Hollow Mountain',
      language: 'en',
      year: 1985,
      genres: ['Fantasy'],
      rating: { average: 4, stars: 4, count: 30 },
      playtimeMinutes: 240,
      slow: false,
      file: { url: A + 'zcode/hollow.zip', archive: { type: 'zip', primary: 'hollow/HOLLOW.Z3' } },
    });
    const cave = result.games.filter((game) => game.tuid === 'fxcave0000000003')[0];
    expect(cave.language).toBe('fr');
    expect(cave.rating).toBeUndefined();
  });

  it('with the adult policy and every format enabled, keeps the adult-tagged and Glulx games', async () => {
    const { dataset } = await raw();
    const result = resolve(dataset, {
      enabledFormats: ['zcode', 'glulx', 'twine', 'ink'],
      policy: 'adult',
      config: CONFIG,
    });
    const kept = result.games.map((game) => game.tuid);
    expect(kept).toContain('fxadlt0000000008');
    expect(kept).toContain('fxtwin0000000006');
    const bells = result.games.filter((game) => game.tuid === 'fxbell0000000002')[0];
    expect(bells).toMatchObject({
      format: 'glulx',
      slow: true,
      genres: ['Fantasy', 'Humor'],
      year: 2019,
    });
    expect(bells.language).toBeUndefined();
    expect(kept).not.toContain('fxexcl0000000011');
  });
});
