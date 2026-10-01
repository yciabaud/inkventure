// Game cards of the ebook (SPEC §8; story S6.1), from the catalogue's featured.json: cover, title, author, length,
// "Start here" badge, pitch, a "Play now" deep link to the app and the QR code of that link. Pure: the build script
// fetches the covers and writes the QR code images.
import type { FeaturedRow } from '../catalog/featured.ts';
import { MAX_PITCH_LENGTH } from '../catalog/featured.ts';

/** Ebook strings of a card (`ebook/<locale>/book.json`), plus the app's own for what the app also shows. */
export interface CardLabels {
  /** `{author}` is replaced. */
  by: string;
  playNow: string;
  /** Alternative text of the QR code image. */
  qrAlt: string;
  /** The app's "Start here" badge (`filters.start`). */
  startHere: string;
  /** The app's lengths (`library.minutes`, `library.hours`): `{count}` is replaced. */
  minutes: string;
  hours: string;
}

export interface Card {
  tuid: string;
  title: string;
  author: string;
  year?: number;
  /** Play time, minutes. */
  minutes?: number;
  starter: boolean;
  pitch?: string;
  /** Deep link into the app: the "Play now" target and the QR code payload. */
  url: string;
  /** Cover image, relative to the book's resources; none → a text placeholder. */
  cover?: string;
  /** QR code image, relative to the book's resources. */
  qr: string;
}

/**
 * The app's base URL, from the ebook configuration: an absolute http(s) URL, kept up to its path, with a trailing
 * slash so the hash route can follow.
 */
export function appBase(host: string): string {
  const url = new URL(host);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Not a web address: ' + host);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

/** The reader's route for a game (SPEC §3.1): opening it downloads and starts the game. */
export function playUrl(host: string, tuid: string): string {
  return appBase(host) + '#/play/' + encodeURIComponent(tuid);
}

/** Same rounding as the app's Library and game screens. */
export function lengthLabel(
  minutes: number,
  labels: Pick<CardLabels, 'minutes' | 'hours'>,
): string {
  if (minutes < 60) return labels.minutes.replace('{count}', String(minutes));
  return labels.hours.replace('{count}', String(Math.round(minutes / 60)));
}

/** A one-line pitch from a game's blurb (for games without a curated pitch): its first paragraph, shortened. */
export function blurbPitch(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const first = description
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!first) return undefined;
  if (first.length <= MAX_PITCH_LENGTH) return first;
  const cut = first.slice(0, MAX_PITCH_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return (
    (space > MAX_PITCH_LENGTH / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '') + '…'
  );
}

/** The first `limit` games of a locale's featured list: the curated ones come first there. */
export function selectRows(rows: FeaturedRow[], limit: number): FeaturedRow[] {
  return rows.slice(0, limit);
}

/** A card for a featured game; `cover` is its fetched cover image, if any. */
export function buildCard(
  row: FeaturedRow,
  options: { host: string; cover?: string; description?: string },
): Card {
  return {
    tuid: row.t,
    title: row.n,
    author: row.a,
    year: row.y,
    minutes: row.p,
    starter: row.st === 1,
    pitch: row.pi || blurbPitch(options.description),
    url: playUrl(options.host, row.t),
    cover: options.cover,
    qr: qrPath(row.t),
  };
}

/** Where a game's QR code image goes, relative to the book's resources. */
export function qrPath(tuid: string): string {
  return 'qr/' + tuid + '.png';
}

/** Text as literal Pandoc Markdown: one line, every markup character escaped (quotes stay, for smart quotes). */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}[\]()#+\-.!<>|~^$&@=%:/]/g, '\\$&');
}

/** One card as Pandoc Markdown (fenced divs and bracketed spans; implicit figures must be off). */
export function cardMarkdown(card: Card, labels: CardLabels): string {
  const title = escapeMarkdown(card.title);
  const meta = [escapeMarkdown(labels.by.replace('{author}', card.author))];
  if (card.year) meta.push(String(card.year));
  if (card.minutes) meta.push(escapeMarkdown(lengthLabel(card.minutes, labels)));
  const lines = ['::: card', '', '## ' + title + ' {#game-' + card.tuid + '}', ''];
  lines.push(
    card.cover
      ? '![' + title + '](' + card.cover + '){.card-cover}'
      : '[' + title + ']{.card-nocover}',
    '',
  );
  lines.push('[' + meta.join(' · ') + ']{.card-meta}', '');
  if (card.starter) lines.push('[' + escapeMarkdown(labels.startHere) + ']{.card-badge}', '');
  if (card.pitch) lines.push(escapeMarkdown(card.pitch), '');
  lines.push('[' + escapeMarkdown(labels.playNow) + '](' + card.url + '){.card-play}', '');
  lines.push('![' + escapeMarkdown(labels.qrAlt) + '](' + card.qr + '){.card-qr}', '');
  lines.push(':::');
  return lines.join('\n');
}

/** The marker in a chapter where the cards go. */
export const CARDS_MARKER = '<!-- cards -->';

/** A chapter with its cards marker replaced by the cards; throws when the marker is missing. */
export function insertCards(chapter: string, cards: Card[], labels: CardLabels): string {
  if (chapter.indexOf(CARDS_MARKER) < 0)
    throw new Error('No ' + CARDS_MARKER + ' marker in the games chapter');
  return chapter.replace(CARDS_MARKER, () =>
    cards.map((card) => cardMarkdown(card, labels)).join('\n\n'),
  );
}

/** `{{host}}` in the chapters: the app's address, as configured. */
export function fillHost(text: string, host: string): string {
  return text.split('{{host}}').join(appBase(host));
}
