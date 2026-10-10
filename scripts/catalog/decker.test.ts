import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { RawDataset, RawGame } from './crawler';
import type { GameRecord } from './ifdb';
import {
  deckerExportsToInspect,
  deckerPageFrom,
  deckerSummary,
  deckInZip,
  inspectDeckerExport,
  isFresh,
  readDeck,
} from './decker';
import type { FetchBytes } from './ink';

const DECK =
  '{deck}\r\nversion:1\r\ncard:0\r\nsize:[512,342]\r\nname:"Test"\r\n\r\n{sounds}\r\nbeep:"%%SND0AAAA"\r\n\r\n' +
  '{card:home}\r\nscript:"on view do sleep[30] end"\r\n{widgets}\r\nb:{"type":"button","animated":1}\r\n' +
  'c:{"type":"canvas"}\r\n\r\n{card:two}\r\n';
const PAGE = (deck: string) =>
  '<html><body><script language="decker">\n' +
  deck +
  '</script><script>runtime()</script></body></html>';
const NOW = new Date('2026-10-10T00:00:00.000Z');
const A = 'https://ifarchive.org/if-archive/games/html/';

function files(entries: Record<string, string>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const name of Object.keys(entries)) out[name] = strToU8(entries[name]);
  return out;
}

describe('the deck of a page', () => {
  it('reads the deck of a web export, with what a look at it shows', () => {
    const found = readDeck(PAGE(DECK));
    expect(found && found.deck.slice(0, 6)).toBe('{deck}');
    expect(found!.notes).toEqual({
      chars: DECK.length,
      cards: 2,
      animated: 1,
      sleeps: 1,
      canvases: 1,
      sounds: 1,
    });
  });

  it('refuses a page without a deck, and a deck of a version the runtime does not read', () => {
    expect(readDeck('<html><script>var x;</script></html>')).toBeNull();
    expect(readDeck(PAGE(DECK.replace('version:1', 'version:2')))).toBeNull();
    expect(readDeck(PAGE('{card:home}\n'))).toBeNull();
  });
});

describe('the deck in a zipped export', () => {
  it('takes the page IFDB names, else the only page holding a deck', () => {
    const zip = files({ 'game/play.html': PAGE(DECK), 'game/credits.html': '<p>Credits</p>' });
    expect(deckInZip(zip, 'game/play.html')).toMatchObject({ page: 'game/play.html' });
    expect(deckInZip(zip, 'GAME/PLAY.HTML')).toMatchObject({ page: 'game/play.html' });
    // IFDB names the credits (or a page the zip does not hold): the one deck.
    expect(deckInZip(zip, 'game/credits.html')).toMatchObject({ page: 'game/play.html' });
    expect(deckInZip(zip, 'index.html')).toMatchObject({ page: 'game/play.html' });
  });

  it('finds none in a zip without a deck or with several (a game in several decks)', () => {
    expect(deckInZip(files({ 'index.html': '<p>Hi</p>' }), 'index.html')).toEqual({
      detail: 'no deck',
    });
    const parts = files({
      'index.html': '<a href="decks/a.html">A</a>',
      'decks/a.html': PAGE(DECK),
      'decks/b.html': PAGE(DECK),
    });
    expect(deckInZip(parts, 'index.html')).toEqual({ detail: '2 decks' });
  });
});

describe('opening an export', () => {
  const fetchFrom =
    (responses: Record<string, { status: number; bytes: Uint8Array }>): FetchBytes =>
    async (url) =>
      responses[url] || { status: 404, bytes: new Uint8Array(0) };

  it('records the page of a zip, or the page itself, with the notes', async () => {
    const zip = zipSync({ 'play.html': strToU8(PAGE(DECK)) });
    const fetchBytes = fetchFrom({
      [A + 'g.zip']: { status: 200, bytes: zip },
      [A + 'g.html']: { status: 200, bytes: strToU8(PAGE(DECK)) },
    });
    const fromZip = await inspectDeckerExport(
      { url: A + 'g.zip', primary: 'play.html' },
      fetchBytes,
      NOW,
    );
    expect(fromZip).toMatchObject({ checked: NOW.toISOString(), page: 'play.html' });
    expect(fromZip.notes!.cards).toBe(2);
    expect(await inspectDeckerExport({ url: A + 'g.html' }, fetchBytes, NOW)).toMatchObject({
      page: A + 'g.html',
    });
  });

  it('records why there is no deck; server errors are transient', async () => {
    const fetchBytes = fetchFrom({
      [A + 'empty.zip']: { status: 200, bytes: zipSync({ 'index.html': strToU8('<p>x</p>') }) },
      [A + 'bad.zip']: { status: 200, bytes: strToU8('not a zip') },
      [A + 'v2.zip']: {
        status: 200,
        bytes: zipSync({ 'p.html': strToU8(PAGE(DECK.replace('version:1', 'version:9'))) }),
      },
      [A + 'down.zip']: { status: 503, bytes: new Uint8Array(0) },
    });
    const check = (url: string) =>
      inspectDeckerExport({ url: url, primary: 'index.html' }, fetchBytes, NOW);
    expect(await check(A + 'empty.zip')).toMatchObject({ detail: 'no deck' });
    expect(await check(A + 'bad.zip')).toMatchObject({ detail: 'not a zip' });
    expect(await check(A + 'v2.zip')).toMatchObject({ detail: 'no deck' });
    expect(await check(A + 'gone.zip')).toEqual({ checked: NOW.toISOString(), detail: 'HTTP 404' });
    expect(await check(A + 'down.zip')).toMatchObject({ detail: 'HTTP 503', transient: true });
  });

  it('reuses a check for 90 days, never a transient one', () => {
    expect(isFresh({ checked: '2026-08-01T00:00:00.000Z', page: 'p' }, NOW)).toBe(true);
    expect(isFresh({ checked: '2026-06-01T00:00:00.000Z', page: 'p' }, NOW)).toBe(false);
    expect(isFresh({ checked: '2026-10-09T00:00:00.000Z', transient: true }, NOW)).toBe(false);
  });
});

describe('the Decker exports of a dataset', () => {
  const game = (tuid: string, devsys: string, links: object[]): RawGame => ({
    tuid: tuid,
    pageVersion: 1,
    queries: [],
    search: {
      tuid: tuid,
      title: 'T ' + tuid,
      link: '',
      author: '',
      hasCoverArt: false,
      devsys: devsys,
    },
    record: { ifdb: { tuid: tuid, downloads: { links: links } } } as unknown as GameRecord,
  });
  const zip = {
    url: 'http://www.ifarchive.org/if-archive/games/html/g.zip',
    format: 'hypertextgame',
    compression: 'zip',
    compressedPrimary: 'g.html',
  };
  const dataset: RawDataset = {
    source: 'test',
    queries: [],
    games: [
      game('deck', 'Decker', [zip, { url: 'https://a.itch.io/g', format: 'hypertextgame' }]),
      game('twine', 'Twine', [{ ...zip, url: A + 't.zip' }]),
    ],
  };

  it('lists the zips and pages of Decker games (IF Archive links in HTTPS), not game stores', () => {
    expect(deckerExportsToInspect(dataset)).toEqual([
      {
        url: 'https://www.ifarchive.org/if-archive/games/html/g.zip',
        primary: 'g.html',
        tuid: 'deck',
        title: 'T deck',
      },
    ]);
  });

  it('gives the resolver the page, and the summary what a look at each deck shows', () => {
    const links = deckerExportsToInspect(dataset);
    const cache = {
      'https://www.ifarchive.org/if-archive/games/html/g.zip#g.html': {
        checked: NOW.toISOString(),
        page: 'g.html',
        notes: readDeck(PAGE(DECK))!.notes,
      },
    };
    expect(deckerPageFrom(cache)(links[0])).toBe('g.html');
    expect(deckerPageFrom({})(links[0])).toBeNull();
    // Too large for an e-reader (MAX_DECK_CHARS).
    const big = { ...cache['https://www.ifarchive.org/if-archive/games/html/g.zip#g.html'] };
    big.notes = { ...big.notes, chars: 9_000_000 };
    const bigCache = { 'https://www.ifarchive.org/if-archive/games/html/g.zip#g.html': big };
    expect(deckerPageFrom(bigCache)(links[0])).toBeNull();
    expect(deckerSummary(links, bigCache)).toContain(
      '| `deck` | T deck | too large | 2 cards, 8789 K;',
    );
    expect(deckerSummary(links, cache)).toContain(
      '| `deck` | T deck | deck | 2 cards, 0 K; 1 animated, 1 sleep, 1 canvas, 1 sound |',
    );
    expect(deckerSummary(links, {})).toContain('| `deck` | T deck | none | not checked |');
  });
});
