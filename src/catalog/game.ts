// Game detail (SPEC §3.5; story S3.3): `games/<tuid>.json`, loaded when a game's page opens, and its blurb as plain
// paragraphs.
import type { GameDetail } from '../../scripts/catalog/emitter';
import { CATALOG_BASE, getJson } from './loader';

export type { GameDetail };

/**
 * IFDB cover thumbnail (SPEC §5.6: always a thumbnail, never the full-size image), rounded up to 10 px steps so
 * nearby sizes share cached images.
 */
export function thumbnailUrl(tuid: string, width: number, height: number): string {
  const up = (n: number) => Math.ceil(n / 10) * 10;
  return (
    'https://ifdb.org/coverart?id=' +
    encodeURIComponent(tuid) +
    '&thumbnail=' +
    up(width) +
    'x' +
    up(height)
  );
}

/** A game's detail, or `missing` when the catalogue has no such game (a stale link). Rejects on network errors. */
export function loadGame(
  tuid: string,
  base: string = CATALOG_BASE,
): Promise<{ status: 'ready'; game: GameDetail } | { status: 'missing' }> {
  return getJson(base + 'games/' + encodeURIComponent(tuid) + '.json').then(
    (data) => {
      const game = data as GameDetail;
      if (!game || game.tuid !== tuid || !game.file) throw new Error('Invalid game detail');
      return { status: 'ready' as const, game: game };
    },
    (error: Error) => {
      if (/^HTTP 404\b/.test(error.message)) return { status: 'missing' as const };
      throw error;
    },
  );
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
};

function codePoint(n: number): string {
  if (!(n > 0 && n <= 0x10ffff)) return '';
  if (n <= 0xffff) return String.fromCharCode(n);
  n -= 0x10000;
  return String.fromCharCode(0xd800 + (n >> 10), 0xdc00 + (n & 0x3ff));
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name.charAt(0) === '#') {
      const hex = name.charAt(1) === 'x' || name.charAt(1) === 'X';
      return codePoint(parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const value = ENTITIES[name.toLowerCase()];
    return value === undefined ? entity : value;
  });
}

/**
 * IFDB's blurb (HTML) as plain paragraphs: line breaks and block elements separate paragraphs, other tags (links,
 * emphasis) keep only their text, scripts and styles are dropped, entities are decoded, whitespace is collapsed.
 * The result is rendered as text, never as HTML.
 */
export function blurbParagraphs(html: string | undefined): string[] {
  if (!html) return [];
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|blockquote|h[1-6]|tr|table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  const paragraphs: string[] = [];
  const lines = decodeEntities(text).split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (line) paragraphs.push(line);
  }
  return paragraphs;
}

/** Whether a story file is hosted on the IF Archive (the credits then name it). */
export function isIfArchive(url: string): boolean {
  return /^https:\/\/(www\.|mirror\.)?ifarchive\.org\//.test(url);
}
