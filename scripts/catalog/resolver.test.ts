import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crawl, type RawDataset, type RawGame, type RecordCache } from './crawler';
import { offlineFetcher } from './fetcher';
import { summarize } from './summary';
import type { GameRecord } from './ifdb';
import {
  chooseFile,
  decodeEntities,
  fileLanguage,
  languagesOf,
  linkFormat,
  normalizeGenres,
  normalizeLanguage,
  onlyLanguage,
  policyReason,
  resolve,
  secureUrl,
  urlsToCheck,
  yearOf,
  type ContentPolicyConfig,
  type StoryFormat,
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
    expect(linkFormat({ url: A + 'story.json' }, 'ink')).toEqual({ format: 'ink', blorb: false });
    expect(linkFormat({ url: A + 'game.t3', format: 'tads3' }, 'TADS 3')).toBeUndefined();
  });

  it("recognises the web exports of ink games: zips and pages, not game stores' pages (S2.7)", () => {
    const exported = { format: 'ink', blorb: false, inkExport: true };
    const zip = { url: A + 'tide.zip', format: 'hypertextgame', compression: 'zip' };
    for (const devsys of ['ink', 'Ink', 'Godot, Ink', 'Inkle', 'Ink / HTML5']) {
      expect(linkFormat({ ...zip, compressedPrimary: 'tide/index.html' }, devsys)).toEqual(
        exported,
      );
    }
    expect(linkFormat({ ...zip, compressedPrimary: 'tide/story.js' }, 'ink')).toEqual(exported);
    // Without the file inside named: an export, which the resolver then drops for its zip.
    expect(linkFormat(zip, 'ink')).toEqual(exported);
    expect(linkFormat({ ...zip, compressedPrimary: 'tide/story.json' }, 'ink')).toEqual({
      format: 'ink',
      blorb: false,
    });
    const page = { url: 'https://unbox.ifarchive.org/x/Tide/index.html', format: 'hypertextgame' };
    expect(linkFormat(page, 'ink')).toEqual(exported);
    expect(
      linkFormat({ url: 'https://author.example/tide/', format: 'hypertextgame' }, 'Ink'),
    ).toEqual(exported);
    expect(linkFormat({ url: 'https://example.com/tide/index.htm' }, 'ink')).toEqual(exported);
    // Not exports: game stores, other files, desktop builds, other systems.
    expect(linkFormat({ url: 'https://author.itch.io/tide', format: 'hypertextgame' }, 'ink')).toBe(
      undefined,
    );
    expect(linkFormat({ url: A + 'tide.ink', format: 'document' }, 'ink')).toBeUndefined();
    expect(
      linkFormat({ ...zip, compressedPrimary: 'Tide/Tide.exe' }, 'Unity, Ink'),
    ).toBeUndefined();
    expect(linkFormat({ ...zip, compressedPrimary: 'inner.zip' }, 'ink')).toBeUndefined();
    expect(linkFormat(page, 'inklewriter')).toBeUndefined();
    expect(linkFormat(page, 'Binksi')).toBeUndefined();
    expect(linkFormat(page, 'Custom JavaScript')).toBeUndefined();
    // An HTML page of an ink game is not Twine, and a Twine page is not ink.
    expect(linkFormat(page, 'ink')!.format).toBe('ink');
    expect(linkFormat(page, 'Twine 2 (Harlowe)')!.format).toBe('twine');
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
      fxinky0000000007: 'format-not-enabled',
      fxnofl0000000009: 'no-game-file',
      fxtwin0000000006: 'format-not-enabled',
    });
    expect(result.games.length + result.dropped.length).toBe(dataset.games.length);
    // Games the policy removes are not counted.
    expect(result.counts.formats).toEqual({ zcode: 3, glulx: 1, twine: 1, ink: 1 });
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
      slow: false,
      genres: ['Fantasy', 'Humor'],
      year: 2019,
    });
    expect(bells.language).toBeUndefined();
    expect(kept).not.toContain('fxexcl0000000011');
  });

  it('flags the games whose Blorb holds at least two pictures besides the cover, and counts them', async () => {
    const { dataset } = await raw();
    const BELLS = A + 'glulx/bells.gblorb';
    const options = {
      enabledFormats: ['zcode', 'glulx'] as StoryFormat[],
      policy: 'general' as const,
    };
    const counted = (pictures: number | undefined) =>
      resolve(dataset, {
        ...options,
        config: CONFIG,
        pictures: (url) => (url === BELLS ? pictures : undefined),
      });

    const illustrated = counted(2);
    const bells = illustrated.games.filter((game) => game.tuid === 'fxbell0000000002')[0];
    expect(bells).toMatchObject({ illustrated: true, pictures: 2 });
    expect(illustrated.games.filter((game) => game.illustrated)).toHaveLength(1);
    expect(illustrated.counts.pictures).toEqual({ blorbs: 1, inspected: 1, illustrated: 1 });

    const one = counted(1);
    expect(one.games.filter((game) => game.illustrated)).toEqual([]);
    expect(one.counts.pictures).toEqual({ blorbs: 1, inspected: 1, illustrated: 0 });
    expect(counted(undefined).counts.pictures).toEqual({ blorbs: 1, inspected: 0, illustrated: 0 });
  });
});

describe('the language of the file played (S2.6)', () => {
  /** A recorded IFDB record (tests/fixtures/ifdb-records), as the crawler would list it. */
  const recorded = (tuid: string, devsys: string): RawGame => {
    const cached = JSON.parse(readFileSync(`tests/fixtures/ifdb-records/${tuid}.json`, 'utf8')) as {
      record: GameRecord;
    };
    const record = cached.record;
    return {
      tuid: tuid,
      pageVersion: 1,
      queries: [],
      search: {
        tuid: tuid,
        title: String((record.bibliographic || {}).title),
        link: '',
        author: '',
        hasCoverArt: false,
        devsys: devsys,
      },
      record: record,
    };
  };
  const JEANGILLE = 'rpis77r72fg8228';
  const games = (): RawGame[] => [
    recorded(JEANGILLE, 'Twine 2 (SugarCube)'),
    recorded('grjll9wqgibm4xq1', 'Twine 2 (Harlowe)'),
    recorded('sh5jnhgsxwwu71t1', 'Twine 2 (SugarCube)'),
    recorded('8u7jw2gxr81ouoan', 'Twine 2 (Harlowe)'),
    recorded('dhwpnm9nyae3jd8b', 'Inform 6'),
  ];
  const run = (dataset: RawGame[], languages?: ContentPolicyConfig['languages']) =>
    resolve({ games: dataset } as RawDataset, {
      enabledFormats: ['zcode', 'glulx', 'twine', 'ink'],
      policy: 'general',
      config: { ...CONFIG, languages: languages },
    });
  const languageOf = (result: ReturnType<typeof run>, tuid: string) =>
    result.games.filter((game) => game.tuid === tuid)[0].language;

  it("lists every language of IFDB's field", () => {
    expect(languagesOf('French, English (fr, en)')).toEqual(['fr', 'en']);
    expect(languagesOf('English, Castilian, Esperanto (en,es,eo)')).toEqual(['en', 'es', 'eo']);
    expect(languagesOf('English, Chinese (en, zh-yue-Hant)')).toEqual(['en', 'zh']);
    expect(languagesOf('&quot;Greek, Modern (1453-)&quot;, English (el, en)')).toEqual([
      'el',
      'en',
    ]);
    expect(languagesOf('English, Français')).toEqual(['en', 'fr']);
    expect(languagesOf('en-US')).toEqual(['en']);
    expect(languagesOf(undefined)).toEqual([]);
  });

  it('reads "only" after or before a language name, in English and in the game\'s languages', () => {
    expect(
      onlyLanguage('Spring Thing 2024 version, at the IF Archive. (English only.)', ['fr', 'en']),
    ).toBe('en');
    expect(onlyLanguage('IFComp release. (English only)', ['en', 'es'])).toBe('en');
    expect(onlyLanguage('ENGLISH ONLY', ['en', 'es'])).toBe('en');
    expect(onlyLanguage('Version en français seulement.', ['en', 'fr'])).toBe('fr');
    expect(onlyLanguage('Uniquement en Français', ['en', 'fr'])).toBe('fr');
    expect(onlyLanguage('Only in Spanish.', ['en', 'es'])).toBe('es');
    expect(onlyLanguage('Sólo en español', ['en', 'es'])).toBe('es');
    // A language the game does not list, no "only", or two languages each "only": nothing is read.
    expect(onlyLanguage('German only.', ['en', 'fr'])).toBeUndefined();
    expect(onlyLanguage('English version.', ['en', 'es'])).toBeUndefined();
    expect(onlyLanguage('At GitHub. (English, español)', ['en', 'es'])).toBeUndefined();
    expect(onlyLanguage('English only, or Spanish only.', ['en', 'es'])).toBeUndefined();
    expect(onlyLanguage('Englishonly', ['en', 'es'])).toBeUndefined();
  });

  it('reads the language of a file from its description, then its name', () => {
    const fl = (desc: string, languages: string[], url = A + 'game.z5') =>
      fileLanguage({ url: url, desc: desc }, languages);
    expect(fl('Spanish version, latest release.', ['es', 'en'])).toBe('es');
    expect(fl('IFComp 2005 version (English).', ['it', 'en'])).toBe('en');
    expect(fl('Traducido por Ruber Eaglenest (Clérigo Urbatain)', ['en', 'es'])).toBe('es');
    expect(fl('In English. Translated by Ricardo Sisnett.', ['es', 'en'])).toBe('en');
    expect(fl('Original version, in French', ['fr', 'it'])).toBe('fr');
    // The language a story was translated from is not its language.
    expect(fl('Translated from Spanish by J. Doe.', ['en', 'es'])).toBeUndefined();
    // Two languages, a bilingual file, or a language the game does not list: unknown, whatever the file name.
    expect(fl('Contains English and Italian story files.', ['it', 'en'])).toBeUndefined();
    expect(fl('bilingual (Slovak/English)', ['en', 'sk'], A + 'x_en.html')).toBeUndefined();
    expect(fl('German translation.', ['en', 'fr'], A + 'x_fr.z5')).toBeUndefined();
    // No language in the description: a language tag in the file's name (or the zip's story file).
    expect(fl('', ['it', 'en'], A + 'hs_ita.z5')).toBe('it');
    expect(fl('Release 2', ['en', 'nl'], A + 'baron_DU.z8')).toBeUndefined();
    expect(fl('', ['en', 'pl'], A + 'Lux%20PL.html')).toBe('pl');
    expect(fl('', ['en', 'es'], A + 'en.z5')).toBeUndefined();
    expect(
      fileLanguage({ url: A + 'x.zip', compressedPrimary: 'x/Tuuli_en.zblorb' }, ['es', 'en']),
    ).toBe('en');
  });

  it('takes the language IFDB gives the file played, on the recorded records', () => {
    const result = run(games());
    // Jeangille: IFDB lists `fr, en`; its IF Archive zip is "(English only.)", and no file is in French.
    expect(languageOf(result, JEANGILLE)).toBe('en');
    expect(languageOf(result, 'grjll9wqgibm4xq1')).toBe('en');
    expect(languageOf(result, 'sh5jnhgsxwwu71t1')).toBe('en');
    // Several languages, nothing said of the file: the first one, counted for review. One language: unchanged.
    expect(languageOf(result, '8u7jw2gxr81ouoan')).toBe('en');
    expect(languageOf(result, 'dhwpnm9nyae3jd8b')).toBe('fr');
    for (const game of result.games) expect(game.versions).toBeUndefined();
    expect(result.languages).toEqual({
      changed: [
        {
          tuid: JEANGILLE,
          title: 'Les lettres du Docteur Jeangille',
          from: 'fr',
          to: 'en',
          source: 'file',
          detail: 'Spring Thing 2024 version, at the IF Archive. (English only.)',
        },
      ],
      versions: [],
      assumed: 1,
      unknownOverrides: [],
    });
  });

  it('keeps a file per language when IFDB offers one, on the recorded records', () => {
    const result = run([
      recorded('qbk3fo0jcawo1j7h', 'Inform 6'),
      recorded('k8fovtn8hqnlawnh', 'Inform 6'),
      recorded('ngcuiadqoqzy1yn0', 'Inform 7'),
      recorded('b8mb4fcwmf1hrxl', 'Inform 7'),
    ]);
    const game = (tuid: string) => result.games.filter((g) => g.tuid === tuid)[0];
    const name = (file: { url: string; archive?: { primary: string } }) =>
      (file.archive ? file.archive.primary : file.url).split('/').pop();
    // Dracula 1: "Spanish version" first (IFDB's order), "English version" besides; the older Spanish release is left.
    expect(game('qbk3fo0jcawo1j7h').language).toBe('es');
    expect(name(game('qbk3fo0jcawo1j7h').file)).toBe('Dracula_La_Primera_Noche.blb');
    expect(game('qbk3fo0jcawo1j7h').versions!.map((v) => [v.language, name(v.file)])).toEqual([
      ['en', 'Dracula_The_First_Night.blb'],
    ]);
    // Hello Sword: listed `it, en`; the file preferred is "(English)", the Italian one is named `hs_ita.z5`.
    expect(game('k8fovtn8hqnlawnh').language).toBe('en');
    expect(name(game('k8fovtn8hqnlawnh').file)).toBe('hs_eng.z5');
    expect(game('k8fovtn8hqnlawnh').versions!.map((v) => [v.language, name(v.file)])).toEqual([
      ['it', 'hs_ita.z5'],
    ]);
    // Tuuli: the file preferred says nothing, the others say Spanish and English: the Spanish one becomes the main
    // file, as the game's first language.
    expect(game('ngcuiadqoqzy1yn0').language).toBe('es');
    expect(game('ngcuiadqoqzy1yn0').versions!.map((v) => [v.language, name(v.file)])).toEqual([
      ['en', 'Tuuli_en.zblorb'],
    ]);
    // Lime Ergot: the Spanish translation ("Traducido por…") is preferred (a Blorb); the English file says nothing.
    expect(game('b8mb4fcwmf1hrxl').language).toBe('es');
    expect(name(game('b8mb4fcwmf1hrxl').file)).toBe('Ergot_de_Lima.zblorb');
    expect(game('b8mb4fcwmf1hrxl').versions!.map((v) => v.language)).toEqual(['en']);

    expect(result.languages.versions.map((v) => [v.tuid, v.languages])).toEqual([
      ['qbk3fo0jcawo1j7h', ['es', 'en']],
      ['k8fovtn8hqnlawnh', ['en', 'it']],
      ['ngcuiadqoqzy1yn0', ['es', 'en']],
      ['b8mb4fcwmf1hrxl', ['es', 'en']],
    ]);
    const changes = Object.fromEntries(result.languages.changed.map((c) => [c.tuid, c]));
    expect(Object.keys(changes).sort()).toEqual([
      'b8mb4fcwmf1hrxl',
      'k8fovtn8hqnlawnh',
      'ngcuiadqoqzy1yn0',
    ]);
    expect(changes.ngcuiadqoqzy1yn0).toMatchObject({
      from: 'es',
      to: 'es',
      file: expect.stringMatching(/Tuuli\.zblorb$/),
    });
  });

  it('offers a file outside the IF Archive in another language only when the app can read it', () => {
    const links = [
      { url: A + 'game.z5', format: 'zcode', isGame: true, desc: 'English version' },
      {
        url: 'https://example.com/juego.z5',
        format: 'zcode',
        isGame: true,
        desc: 'Spanish version',
      },
    ];
    const rec = record(links, {}) as GameRecord;
    rec.bibliographic = { title: 'Two', language: 'English, Castilian (en, es)' };
    expect(urlsToCheck(rec, '', ['zcode'])).toEqual(['https://example.com/juego.z5']);
    const raw: RawGame = {
      tuid: 'two',
      pageVersion: 1,
      queries: [],
      search: { tuid: 'two', title: 'Two', link: '', author: '', hasCoverArt: false, devsys: '' },
      record: rec,
    };
    const resolveWith = (readable: boolean) =>
      resolve({ games: [raw] } as RawDataset, {
        enabledFormats: ['zcode'],
        policy: 'general',
        config: CONFIG,
        readable: () => readable,
      }).games[0].versions;
    expect(resolveWith(true)).toEqual([
      { language: 'es', file: { url: 'https://example.com/juego.z5', ifdbFormat: 'zcode' } },
    ]);
    expect(resolveWith(false)).toBeUndefined();
    // A game in one language: its other files are not checked.
    rec.bibliographic.language = 'en';
    expect(urlsToCheck(rec, '', ['zcode'])).toEqual([]);
  });

  it('only reads languages the game lists', () => {
    const edited = (desc: string, language: string): RawGame => {
      const game = recorded(JEANGILLE, 'Twine 2 (SugarCube)');
      const record = JSON.parse(JSON.stringify(game.record)) as GameRecord;
      const links = record.ifdb.downloads!.links as Array<{ desc?: string }>;
      links[2].desc = desc;
      record.bibliographic!.language = language;
      return { ...game, record: record };
    };
    expect(
      languageOf(
        run([edited('Version en français seulement.', 'English, French (en, fr)')]),
        JEANGILLE,
      ),
    ).toBe('fr');
    expect(languageOf(run([edited('German only.', 'French, English (fr, en)')]), JEANGILLE)).toBe(
      'fr',
    );
    expect(
      languageOf(run([edited('At the IF Archive.', 'French, English (fr, en)')]), JEANGILLE),
    ).toBe('fr');
  });

  it('applies the overrides last and reports those naming no kept game', () => {
    const result = run(games().concat([recorded('qbk3fo0jcawo1j7h', 'Inform 6')]), {
      '8u7jw2gxr81ouoan': { language: 'fr', reason: 'The zip holds the French version.' },
      [JEANGILLE]: { language: 'fr', reason: 'Checked by hand.' },
      qbk3fo0jcawo1j7h: { language: 'en', reason: 'Checked by hand.' },
      zzzzunknown00000: { language: 'en', reason: 'Gone from IFDB.' },
    });
    expect(languageOf(result, '8u7jw2gxr81ouoan')).toBe('fr');
    expect(languageOf(result, JEANGILLE)).toBe('fr');
    // A file in the overridden language besides the main one is dropped.
    expect(languageOf(result, 'qbk3fo0jcawo1j7h')).toBe('en');
    expect(result.games.filter((g) => g.tuid === 'qbk3fo0jcawo1j7h')[0].versions).toBeUndefined();
    const changes = Object.fromEntries(result.languages.changed.map((c) => [c.tuid, c]));
    expect(changes['8u7jw2gxr81ouoan']).toEqual({
      tuid: '8u7jw2gxr81ouoan',
      title: 'Clarence Street, 14.',
      from: 'en',
      to: 'fr',
      source: 'override',
      detail: 'The zip holds the French version.',
    });
    expect(changes[JEANGILLE]).toMatchObject({ from: 'fr', to: 'fr', source: 'override' });
    expect(result.languages.unknownOverrides).toEqual(['zzzzunknown00000']);
  });

  it('lists the changed games, the files per language and the games to review in the job summary', () => {
    const dataset = {
      games: games().concat([recorded('k8fovtn8hqnlawnh', 'Inform 6')]),
    } as RawDataset;
    const summary = summarize(
      dataset,
      run(dataset.games, { zzzzunknown00000: { language: 'en', reason: '' } }),
    );
    expect(summary).toContain(
      '| `rpis77r72fg8228` | Les lettres du Docteur Jeangille | fr → en | file | ' +
        'Spring Thing 2024 version, at the IF Archive. (English only.) |',
    );
    expect(summary).toContain('| `k8fovtn8hqnlawnh` | Hello Sword | en, it |');
    expect(summary).toContain(
      '1 kept game(s) in several languages play a file whose language IFDB does not say',
    );
    expect(summary).toContain('Language overrides naming no kept game: `zzzzunknown00000`.');
  });

  it('escapes backslashes and pipes in the summary table', () => {
    const dataset = { games: games() } as RawDataset;
    const summary = summarize(
      dataset,
      run(dataset.games, { [JEANGILLE]: { language: 'fr', reason: 'a\\|b' } }),
    );
    expect(summary).toContain('| override | a\\\\\\|b |');
  });
});

describe('ink web exports (S2.7)', () => {
  const ZIP = A + 'ink/tide.zip';
  const PAGE = 'https://xyz.unbox.ifarchive.org/xyz/Tide/index.html';
  const OTHER = 'https://author.example/tide/index.html';
  const zip = {
    url: ZIP,
    format: 'hypertextgame',
    compression: 'zip',
    compressedPrimary: 'Tide/index.html',
  };
  const ink: StoryFormat[] = ['ink'];
  const stories: Record<string, string> = {
    [ZIP + '#Tide/index.html']: 'Tide/Tide.js',
    [PAGE]: 'https://xyz.unbox.ifarchive.org/xyz/Tide/Tide.js',
    [OTHER]: 'https://author.example/tide/story.js',
  };
  const inkStory = (link: { url: string; primary?: string }) =>
    stories[link.primary ? link.url + '#' + link.primary : link.url] || null;

  it('points a zip at the file holding the story, and a page at the script holding it', () => {
    const fromZip = chooseFile(record([zip]), 'ink', ink, undefined, inkStory);
    expect('file' in fromZip && fromZip.file.file).toEqual({
      url: ZIP,
      ifdbFormat: 'hypertextgame',
      archive: { type: 'zip', primary: 'Tide/Tide.js' },
    });
    const fromPage = chooseFile(
      record([{ url: PAGE, format: 'hypertextgame' }]),
      'ink',
      ink,
      undefined,
      inkStory,
    );
    expect('file' in fromPage && fromPage.file.file.url).toBe(stories[PAGE]);
  });

  it('without the checks, assumes the file IFDB names holds the story', () => {
    const choice = chooseFile(record([zip]), 'ink', ink);
    expect('file' in choice && choice.file.file.archive).toEqual({
      type: 'zip',
      primary: 'Tide/index.html',
    });
  });

  it('drops an export without a story, and checks CORS on the script of a page outside the IF Archive', () => {
    const none = chooseFile(
      record([
        { ...zip, url: A + 'ink/empty.zip' },
        { url: 'https://a.itch.io/t', format: 'hypertextgame' },
      ]),
      'ink',
      ink,
      undefined,
      inkStory,
    );
    expect(none).toEqual({ reason: 'no-ink-story', detail: A + 'ink/empty.zip' });
    const links = [{ url: OTHER, format: 'hypertextgame' }];
    expect(urlsToCheck(record(links), 'ink', ink, inkStory)).toEqual([stories[OTHER]]);
    expect(chooseFile(record(links), 'ink', ink, () => false, inkStory)).toEqual({
      reason: 'unreadable-host',
      detail: stories[OTHER],
    });
  });

  it('counts the ink games kept and dropped, by reason, in the job summary', async () => {
    const game = (tuid: string, devsys: string, links: Link[]): RawGame => ({
      tuid: tuid,
      pageVersion: 1,
      queries: [],
      search: { tuid: tuid, title: tuid, link: '', author: '', hasCoverArt: false, devsys: devsys },
      record: record(links, { tuid: tuid }),
    });
    const dataset: RawDataset = {
      source: 'test',
      queries: [],
      games: [
        game('kept', 'Ink', [zip]),
        game('empty', 'ink', [{ ...zip, url: A + 'ink/empty.zip' }]),
        game('itch', 'Godot, Ink', [
          { url: 'https://a.itch.io/t', format: 'hypertextgame', isGame: true },
        ]),
        game('z', 'Inform 7', [{ url: A + 'z.z5', format: 'zcode' }]),
      ],
    };
    const resolution = resolve(dataset, {
      enabledFormats: ['zcode', 'ink'],
      policy: 'general',
      config: CONFIG,
      inkStory: inkStory,
    });
    expect(resolution.games.map((g) => g.tuid)).toEqual(['kept', 'z']);
    const summary = summarize(dataset, resolution);
    expect(summary).toContain('**Ink games (S2.7)**: 3 crawled, 1 kept, 2 dropped.');
    expect(summary).toContain('| `no-ink-story` | 1 |');
    expect(summary).toContain('| `unsupported-format` | 1 |');
  });
});
