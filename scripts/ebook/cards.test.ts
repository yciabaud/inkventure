import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import qrcode from 'qrcode-generator';
import { afterEach, describe, expect, it } from 'vitest';
import { thumbnailUrl } from '../../src/catalog/game';
import type { FeaturedRow } from '../catalog/featured';
import { MAX_PITCH_LENGTH } from '../catalog/featured';
import {
  appBase,
  blurbPitch,
  buildCard,
  cardMarkdown,
  CARDS_MARKER,
  escapeMarkdown,
  fillHost,
  insertCards,
  lengthLabel,
  playUrl,
  selectRows,
  type CardLabels,
} from './cards';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  coverUrl,
  fetchCover,
  imageExtension,
  type FetchBytes,
} from './covers';
import { uiLocales } from '../catalog/locales';
import { encodeGrayPng } from './png';
import { cardQr, qrMatrix } from './qr';

const HOST = 'https://example.org/inkventure/';
const labels: CardLabels = {
  by: 'by {author}',
  playNow: 'Play now',
  qrAlt: 'QR code',
  startHere: 'Start here',
  minutes: '{count} min',
  hours: '{count} h',
};

function row(extra: Partial<FeaturedRow> = {}): FeaturedRow {
  return { t: 'abc123', n: 'The Lamp', a: 'A. Author', f: 'zcode', y: 2020, p: 15, ...extra };
}

/** Decodes a PNG written by encodeGrayPng back to its pixels. */
function decodePng(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let offset = 8;
  let data = new Uint8Array(0);
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === 'IDAT')
      data = new Uint8Array([...data, ...png.subarray(offset + 8, offset + 8 + length)]);
    offset += 12 + length;
  }
  const raw = inflateSync(data);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width + 1)]).toBe(0);
    pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width: width, height: height, pixels: pixels };
}

describe('deep links', () => {
  it('point to the reader route on the configured host', () => {
    expect(playUrl(HOST, 'abc123')).toBe('https://example.org/inkventure/#/play/abc123');
    expect(buildCard(row(), { host: HOST }).url).toBe(
      'https://example.org/inkventure/#/play/abc123',
    );
  });

  it('normalise the host: trailing slash added, query and hash dropped', () => {
    expect(appBase('https://example.org/inkventure')).toBe('https://example.org/inkventure/');
    expect(appBase('https://example.org')).toBe('https://example.org/');
    expect(playUrl('https://example.org/app?x=1#/home', 'q1')).toBe(
      'https://example.org/app/#/play/q1',
    );
  });

  it('refuse a host that is not a web address', () => {
    expect(() => appBase('example.org')).toThrow();
    expect(() => appBase('ftp://example.org/')).toThrow(/Not a web address/);
  });

  it('fill {{host}} in the chapters', () => {
    expect(fillHost('Go to <{{host}}>, then <{{host}}>.', 'https://example.org/app')).toBe(
      'Go to <https://example.org/app/>, then <https://example.org/app/>.',
    );
  });
});

describe('QR codes', () => {
  it('encode the card deep link, as a valid PNG with a quiet zone', () => {
    const card = buildCard(row(), { host: HOST });
    const { path, png } = cardQr(card);
    expect(path).toBe('qr/abc123.png');
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    // Built independently from the expected payload with the QR library.
    const qr = qrcode(0, 'M');
    qr.addData('https://example.org/inkventure/#/play/abc123', 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const { width, height, pixels } = decodePng(png);
    const scale = width / (size + 8);
    expect(width).toBe(height);
    expect(Number.isInteger(scale)).toBe(true);
    for (let y = 0; y < size + 8; y++) {
      for (let x = 0; x < size + 8; x++) {
        const inside = x >= 4 && y >= 4 && x < size + 4 && y < size + 4;
        const dark = inside && qr.isDark(y - 4, x - 4);
        const pixel = pixels[(y * scale + scale / 2) * width + x * scale + scale / 2];
        expect(pixel).toBe(dark ? 0 : 255);
      }
    }
  });

  it('matrix is square and has the finder patterns', () => {
    const matrix = qrMatrix('https://example.org/#/play/x');
    expect(matrix.every((r) => r.length === matrix.length)).toBe(true);
    expect(matrix[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
  });

  it('PNG encoder checks the pixel count', () => {
    expect(() => encodeGrayPng(2, 2, new Uint8Array(3))).toThrow();
  });
});

describe('cards', () => {
  it('render title, author, year, length, badge, pitch, link and QR code', () => {
    const card = buildCard(row({ st: 1, pi: 'A lighthouse keeper.' }), {
      host: HOST,
      cover: 'covers/abc123.jpg',
    });
    const md = cardMarkdown(card, labels);
    expect(md).toContain('## The Lamp {#game-abc123}');
    expect(md).toContain('![The Lamp](covers/abc123.jpg){.card-cover}');
    expect(md).toContain('[by A\\. Author · 2020 · 15 min]{.card-meta}');
    expect(md).toContain('[Start here]{.card-badge}');
    expect(md).toContain('A lighthouse keeper\\.');
    expect(md).toContain('[Play now](https://example.org/inkventure/#/play/abc123){.card-play}');
    expect(md).toContain('![QR code](qr/abc123.png){.card-qr}');
    expect(md.startsWith('::: card')).toBe(true);
  });

  it('fall back to a text placeholder without a cover', () => {
    const md = cardMarkdown(buildCard(row(), { host: HOST }), labels);
    expect(md).toContain('[The Lamp]{.card-nocover}');
    expect(md).not.toContain('card-cover');
  });

  it('leave out what the game does not have', () => {
    const md = cardMarkdown(buildCard(row({ y: undefined, p: undefined }), { host: HOST }), labels);
    expect(md).toContain('[by A\\. Author]{.card-meta}');
    expect(md).not.toContain('card-badge');
  });

  it('use the app rounding for lengths', () => {
    expect(lengthLabel(45, labels)).toBe('45 min');
    expect(lengthLabel(60, labels)).toBe('1 h');
    expect(lengthLabel(150, labels)).toBe('3 h');
  });

  it('take a pitch from the blurb when no curated one', () => {
    expect(buildCard(row(), { host: HOST, description: 'Short blurb.\n\nMore.' }).pitch).toBe(
      'Short blurb.',
    );
    const long = blurbPitch('word '.repeat(60));
    expect(long!.length).toBeLessThanOrEqual(MAX_PITCH_LENGTH);
    expect(long!.endsWith('word…')).toBe(true);
    expect(blurbPitch(undefined)).toBeUndefined();
    expect(blurbPitch('  ')).toBeUndefined();
  });

  it('escape Markdown in titles and text', () => {
    expect(escapeMarkdown('1984. *Big* [brother] #1')).toBe('1984\\. \\*Big\\* \\[brother\\] \\#1');
    expect(escapeMarkdown("Grunk's\n  pig")).toBe("Grunk's pig");
  });

  it('go where the chapter marker is, in order', () => {
    const cards = selectRows([row({ t: 'a1' }), row({ t: 'b2' }), row({ t: 'c3' })], 2).map((r) =>
      buildCard(r, { host: HOST }),
    );
    const chapter = insertCards('# Games\n\n' + CARDS_MARKER + '\n', cards, labels);
    expect(chapter.indexOf('{#game-a1}')).toBeLessThan(chapter.indexOf('{#game-b2}'));
    expect(chapter).not.toContain('c3');
    expect(chapter).not.toContain(CARDS_MARKER);
    expect(() => insertCards('# Games', cards, labels)).toThrow(/marker/);
  });
});

describe('covers', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it('use the same IFDB thumbnail URL as the app', () => {
    expect(coverUrl('abc123', COVER_WIDTH, COVER_HEIGHT)).toBe(
      thumbnailUrl('abc123', COVER_WIDTH, COVER_HEIGHT),
    );
    expect(coverUrl('a b', 33, 47)).toBe(thumbnailUrl('a b', 33, 47));
  });

  it('are fetched once and cached', async () => {
    dir = mkdtempSync(join(tmpdir(), 'covers-'));
    const urls: string[] = [];
    const fetchBytes: FetchBytes = (url) => {
      urls.push(url);
      return Promise.resolve({ status: 200, body: JPEG });
    };
    expect(await fetchCover('abc123', dir, fetchBytes)).toBe('abc123.jpg');
    expect(await fetchCover('abc123', dir, fetchBytes)).toBe('abc123.jpg');
    expect(urls).toEqual([coverUrl('abc123', COVER_WIDTH, COVER_HEIGHT)]);
    expect([...readFileSync(join(dir, 'abc123.jpg'))]).toEqual([...JPEG]);
  });

  it('fall back (undefined) on an error, a missing or a non-image cover', async () => {
    dir = mkdtempSync(join(tmpdir(), 'covers-'));
    const html = new TextEncoder().encode('<html>');
    expect(await fetchCover('a', dir, () => Promise.reject(new Error('offline')))).toBeUndefined();
    expect(
      await fetchCover('b', dir, () => Promise.resolve({ status: 404, body: JPEG })),
    ).toBeUndefined();
    expect(
      await fetchCover('c', dir, () => Promise.resolve({ status: 200, body: html })),
    ).toBeUndefined();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('recognise the image formats an ebook can hold', () => {
    expect(imageExtension(JPEG)).toBe('jpg');
    expect(imageExtension(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
    expect(imageExtension(new TextEncoder().encode('GIF89a'))).toBe('gif');
    expect(imageExtension(new TextEncoder().encode('RIFF'))).toBeUndefined();
  });
});

describe('ebook sources', () => {
  it('exist for every UI locale, with the card strings and one games chapter', () => {
    for (const locale of uiLocales()) {
      const book = JSON.parse(readFileSync(join('ebook', locale, 'book.json'), 'utf8'));
      expect(book.lang).toBe(locale);
      for (const key of ['by', 'playNow', 'qrAlt']) expect(book.cards[key]).toBeTruthy();
      expect(book.cards.by).toContain('{author}');
      const chapters = readdirSync(join('ebook', locale)).filter((name) =>
        /^\d\d-.*\.md$/.test(name),
      );
      const withCards = chapters.filter((name) =>
        readFileSync(join('ebook', locale, name), 'utf8').includes(CARDS_MARKER),
      );
      expect(withCards).toHaveLength(1);
    }
    expect(appBase(JSON.parse(readFileSync('ebook/config.json', 'utf8')).host)).toMatch(/^https:/);
  });
});
