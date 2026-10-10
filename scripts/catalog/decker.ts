// Decker games (SPEC §5.2 step 2; story S2.9). Decker games are published as Decker's web export: a page holding the
// runtime and the deck in a `<script language="decker">` block, zipped on the IF Archive (a page elsewhere). The weekly
// build opens each export once, finds the page that holds a deck the app's runtime reads, and notes what a look at the
// deck shows of how it plays on e-ink (animated widgets, `sleep`, canvases, sounds); the resolver then points the game
// at that page. Results are cached per link, like the ink checks.
import { strFromU8, unzipSync } from 'fflate';
import { deckText } from '../../src/engines/decker/deckerHtml.ts';
import type { RawDataset } from './crawler.ts';
import { inkKey, type FetchBytes } from './ink.ts';
import { linkFormat, secureUrl } from './resolver.ts';

/** A check is reused this long; exports seldom change. */
export const DECKER_MAX_AGE_DAYS = 90;

/** An export bigger than this is not opened. */
export const MAX_DECKER_EXPORT_BYTES = 50 * 1024 * 1024;

/**
 * A deck larger than this is left out: the Kindle did not open EyeOS's (9.3 M characters, owner's check of S2.9), and
 * a deck is held several times over in memory (the page, the frame's document, Decker's own copy).
 */
export const MAX_DECK_CHARS = 5_000_000;

/** What a static look at a deck shows: things that play badly on e-ink, counted (S2.9 suitability). */
export interface DeckNotes {
  /** Size of the deck (characters). */
  chars: number;
  cards: number;
  /** Widgets drawn again on every frame (`animated`). */
  animated: number;
  /** `sleep` calls in scripts (timed sequences). */
  sleeps: number;
  /** Canvas widgets (drawn by scripts). */
  canvases: number;
  sounds: number;
}

export interface DeckerEntry {
  /** Date of the check (ISO). */
  checked: string;
  /** Where the deck is: its page's path in the zip, or the page's URL. */
  page?: string;
  notes?: DeckNotes;
  /** Why there is no deck: none in the export, several (a game of several decks), an HTTP error… */
  detail?: string;
  /** A network or server error: checked again at the next run. */
  transient?: boolean;
}

/** Export link (`deckerKey`) → last check. Kept on the `catalog` branch with the record cache. */
export type DeckerCache = Record<string, DeckerEntry>;

/** A web export to open: a zip (with the page IFDB names in it) or a page. */
export interface DeckerExport {
  url: string;
  primary?: string;
}

/** The cache key of an export: its URL, and the page IFDB names in a zip. */
export const deckerKey: (link: DeckerExport) => string = inkKey;

/** Whether a cached check is recent enough to reuse. */
export function isFresh(entry: DeckerEntry | undefined, now: Date): boolean {
  if (!entry || entry.transient) return false;
  const age = now.getTime() - new Date(entry.checked).getTime();
  return age >= 0 && age < DECKER_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

/**
 * The deck of a page, when it is one the app's runtime reads (Decker's text format, version 1), else null; with what
 * a look at it shows.
 */
export function readDeck(html: string): { deck: string; notes: DeckNotes } | null {
  const deck = deckText(html);
  if (!deck || !/^\{deck\}\r?\nversion:1\r?$/m.test(deck.slice(0, 64))) return null;
  return {
    deck: deck,
    notes: {
      chars: deck.length,
      cards: count(deck, /^\{card:/gm),
      animated: count(deck, /"animated":1/g),
      sleeps: count(deck, /\bsleep\[/g),
      canvases: count(deck, /"type":"canvas"/g),
      sounds: count(deck, /^[^\s:]+:"%%SND/gm),
    },
  };
}

/**
 * The page holding the deck in an unzipped export: the page IFDB names when it holds one, else the only page of the
 * zip that does. A zip of several decks (a game in several parts) has none: the app plays one deck.
 */
export function deckInZip(
  entries: Record<string, Uint8Array>,
  primary: string,
): { page: string; notes: DeckNotes } | { detail: string } {
  const pages = Object.keys(entries).filter((name) => /\.html?$/i.test(name));
  const named = pages.filter((name) => name.toLowerCase() === primary.toLowerCase());
  if (named.length === 1) {
    const found = readDeck(strFromU8(entries[named[0]]));
    if (found) return { page: named[0], notes: found.notes };
  }
  const decks = pages
    .map((page) => ({ page: page, found: readDeck(strFromU8(entries[page])) }))
    .filter((item) => item.found);
  if (decks.length === 1) return { page: decks[0].page, notes: decks[0].found!.notes };
  return { detail: decks.length ? decks.length + ' decks' : 'no deck' };
}

function failure(response: { status: number }, checked: string): DeckerEntry {
  const entry: DeckerEntry = { checked: checked, detail: 'HTTP ' + response.status };
  if (response.status >= 500 || response.status === 429) entry.transient = true;
  return entry;
}

/** Opens an export and finds its deck. */
export async function inspectDeckerExport(
  link: DeckerExport,
  fetchBytes: FetchBytes,
  now: Date,
): Promise<DeckerEntry> {
  const checked = now.toISOString();
  const response = await fetchBytes(link.url);
  if (response.status !== 200) return failure(response, checked);
  if (response.bytes.length > MAX_DECKER_EXPORT_BYTES)
    return { checked: checked, detail: 'too large' };
  if (link.primary) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(response.bytes, { filter: (file) => /\.html?$/i.test(file.name) });
    } catch {
      return { checked: checked, detail: 'not a zip' };
    }
    const found = deckInZip(entries, link.primary);
    return 'page' in found
      ? { checked: checked, page: found.page, notes: found.notes }
      : { checked: checked, detail: found.detail };
  }
  const found = readDeck(strFromU8(response.bytes));
  return found
    ? { checked: checked, page: link.url, notes: found.notes }
    : { checked: checked, detail: 'no deck' };
}

/** The resolver's `deckerPage` for a cache: the page holding the deck, or null when there is none or it is unchecked. */
export function deckerPageFrom(cache: DeckerCache): (link: DeckerExport) => string | null {
  return (link) => {
    const entry = cache[deckerKey(link)];
    if (!entry || !entry.page) return null;
    return entry.notes && entry.notes.chars > MAX_DECK_CHARS ? null : entry.page;
  };
}

/** The web exports of the Decker games of a dataset, each once, sorted by key: the links `check-decker.ts` opens. */
export function deckerExportsToInspect(
  dataset: RawDataset,
): Array<DeckerExport & { tuid: string; title: string }> {
  const found: Record<string, DeckerExport & { tuid: string; title: string }> = {};
  for (const game of dataset.games) {
    const devsys = game.search.devsys || '';
    const downloads = game.record.ifdb.downloads;
    const links = ((downloads && downloads.links) || []) as Array<{
      url: string;
      format?: string;
      compression?: string;
      compressedPrimary?: string;
    }>;
    for (const link of links) {
      if (!link.url) continue;
      const detected = linkFormat(link, devsys);
      if (!detected || !detected.deckerExport) continue;
      if (link.compression && !(link.compression === 'zip' && link.compressedPrimary)) continue;
      const url = secureUrl(link.url);
      if (!url) continue;
      const item: DeckerExport = link.compression
        ? { url: url, primary: link.compressedPrimary }
        : { url: url };
      found[deckerKey(item)] = { ...item, tuid: game.tuid, title: game.search.title || game.tuid };
    }
  }
  return Object.keys(found)
    .sort()
    .map((key) => found[key]);
}

/**
 * Markdown table of the decks found, with what a look at each shows (S2.9 suitability: what to check on the Kindle
 * first), and of the exports without a deck.
 */
export function deckerSummary(
  links: Array<DeckerExport & { tuid: string; title: string }>,
  cache: DeckerCache,
): string {
  const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const rows = links.map((link) => {
    const entry = cache[deckerKey(link)];
    const n = entry && entry.notes;
    const look = n
      ? `${n.cards} cards, ${Math.round(n.chars / 1024)} K; ` +
        [
          n.animated && n.animated + ' animated',
          n.sleeps && n.sleeps + ' sleep',
          n.canvases && n.canvases + ' canvas',
          n.sounds && n.sounds + ' sound',
        ]
          .filter(Boolean)
          .join(', ')
      : (entry && entry.detail) || 'not checked';
    const kept = !!n && n.chars <= MAX_DECK_CHARS;
    return `| \`${link.tuid}\` | ${cell(link.title)} | ${kept ? 'deck' : n ? 'too large' : 'none'} | ${cell(look.replace(/; $/, ''))} |`;
  });
  return rows.length
    ? '| Game | Title | Deck | A look at it |\n|---|---|---|---|\n' + rows.join('\n') + '\n'
    : 'No Decker export.\n';
}
