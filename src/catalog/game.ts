// Game detail (SPEC §3.5; story S3.3): `games/<tuid>.json`, loaded when a game's page opens, and its blurb as plain
// paragraphs.
import type { GameDetail } from '../../scripts/catalog/emitter';
import type { StoryFile } from '../../scripts/catalog/resolver';
import { gameId, parseGameId } from '../storage/keys';
import { CATALOG_BASE, getJson } from './loader';

export type { GameDetail };

/** A file of a game in one language (S2.6): the default one has the game's TUID as id, the others `<tuid>-<lang>`. */
export interface GameVersion {
  id: string;
  language?: string;
  file: StoryFile;
}

/** The game's files, the default one first, then one per other language in the catalogue's order. */
export function gameVersions(game: GameDetail): GameVersion[] {
  const versions: GameVersion[] = [{ id: game.tuid, language: game.language, file: game.file }];
  const others = game.versions || [];
  for (let i = 0; i < others.length; i++) {
    versions.push({
      id: gameId(game.tuid, others[i].language),
      language: others[i].language,
      file: others[i].file,
    });
  }
  return versions;
}

/** The version of a game id (see `gameId`), or undefined when the game has no file in that language. */
export function versionOf(game: GameDetail, id: string): GameVersion | undefined {
  const versions = gameVersions(game);
  for (let i = 0; i < versions.length; i++) if (versions[i].id === id) return versions[i];
  return undefined;
}

/**
 * The version a game page opens on (S2.6): the one its link names (`<tuid>-<lang>`), else the one last played, else
 * the one in the UI language, else the default file.
 */
export function initialVersion(
  versions: GameVersion[],
  id: string,
  locale: string,
  played: (id: string) => number,
): GameVersion {
  if (parseGameId(id).language) {
    for (let i = 0; i < versions.length; i++) if (versions[i].id === id) return versions[i];
  }
  let best: GameVersion | undefined;
  let bestTime = 0;
  for (let i = 0; i < versions.length; i++) {
    const time = played(versions[i].id);
    if (time > bestTime) {
      best = versions[i];
      bestTime = time;
    }
  }
  if (best) return best;
  for (let i = 0; i < versions.length; i++) if (versions[i].language === locale) return versions[i];
  return versions[0];
}

/**
 * IFDB cover thumbnail (SPEC §5.6: always a thumbnail, never the full-size image), rounded up to 10 px steps so
 * nearby sizes share cached images. A game id in another language (S2.6) shows its game's cover.
 */
export function thumbnailUrl(id: string, width: number, height: number): string {
  const up = (n: number) => Math.ceil(n / 10) * 10;
  return (
    'https://ifdb.org/coverart?id=' +
    encodeURIComponent(parseGameId(id).tuid) +
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

/** Elements that end a paragraph (opening or closing), besides `<br>`. */
const BLOCKS: Record<string, boolean> = {
  br: true,
  p: true,
  div: true,
  li: true,
  ul: true,
  ol: true,
  blockquote: true,
  h1: true,
  h2: true,
  h3: true,
  h4: true,
  h5: true,
  h6: true,
  tr: true,
  table: true,
};

/** Elements dropped with their content. */
const DROPPED: Record<string, boolean> = { script: true, style: true };

/**
 * The text of an HTML fragment, in one pass over it: tags are skipped (block elements and `<br>` become line
 * breaks), comments and `<script>` / `<style>` elements are dropped with their content. A `<` that does not start a
 * tag stays as text. Entities are left for `decodeEntities`.
 */
function htmlText(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (lower.substr(lt, 4) === '<!--') {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const tag = /^<(\/?)([a-z][a-z0-9]*)/.exec(lower.substr(lt, 16));
    const gt = html.indexOf('>', lt + 1);
    if (!tag) {
      out += '<';
      i = lt + 1;
      continue;
    }
    if (gt < 0) break; // an unterminated tag: nothing after it is text
    const name = tag[2];
    if (DROPPED[name] && !tag[1]) {
      const close = lower.indexOf('</' + name, gt + 1);
      const end = close < 0 ? -1 : html.indexOf('>', close);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    if (BLOCKS[name]) out += '\n';
    i = gt + 1;
  }
  return out;
}

/**
 * IFDB's blurb (HTML) as plain paragraphs: line breaks and block elements separate paragraphs, other tags (links,
 * emphasis) keep only their text, scripts and styles are dropped, entities are decoded, whitespace is collapsed.
 * The result is rendered as text, never as HTML.
 */
export function blurbParagraphs(html: string | undefined): string[] {
  if (!html) return [];
  const paragraphs: string[] = [];
  const lines = decodeEntities(htmlText(html)).split(/\n/);
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
