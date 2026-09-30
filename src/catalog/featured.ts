// Featured shelf data (SPEC §5.3; story S4.1): `featured.json`, one list per UI locale (curated games with their pitch,
// then the best-rated ones in that language), and what the Home shelf shows of it.
import type { FeaturedFile, FeaturedRow } from '../../scripts/catalog/featured';
import { CATALOG_BASE, getJson } from './loader';

export type { FeaturedFile, FeaturedRow };

/** The featured lists format this app reads (scripts/catalog/featured.ts FEATURED_VERSION). */
export const SUPPORTED_FEATURED_VERSION = 1;

/** Games shown on the shelf at most, all pages together. */
export const SHELF_MAX = 24;

let cached: Promise<FeaturedFile> | null = null;

/** `featured.json`, loaded once per session; a failed load is retried by the next call. */
export function loadFeatured(base: string = CATALOG_BASE): Promise<FeaturedFile> {
  if (!cached) {
    cached = getJson(base + 'featured.json').then((data) => {
      const file = data as FeaturedFile;
      if (!file || file.version !== SUPPORTED_FEATURED_VERSION || !file.locales) {
        throw new Error('Unsupported featured lists');
      }
      return file;
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** For tests: forget the loaded lists. */
export function resetFeatured(): void {
  cached = null;
}

/**
 * The shelf of a UI locale: its list in order, without the games already in progress (started or added to Home),
 * at most `max` games. A locale without a list shows nothing (the shelf only offers games in the reader's language).
 */
export function featuredFor(
  file: FeaturedFile,
  locale: string,
  inProgress: (tuid: string) => boolean,
  max: number = SHELF_MAX,
): FeaturedRow[] {
  const list = file.locales[locale] || [];
  const shown: FeaturedRow[] = [];
  for (let i = 0; i < list.length && shown.length < max; i++) {
    if (!inProgress(list[i].t)) shown.push(list[i]);
  }
  return shown;
}

/** Space between two shelf cards. */
export const CARD_GAP = 16;

/** Height under a card's cover: badge, two lines of title, three of pitch. */
export const CARD_TEXT_HEIGHT = 136;

/** Card cover height bounds (2:3 covers), and the narrowest card (its text needs room). */
export const MAX_COVER_HEIGHT = 204;
export const MIN_COVER_HEIGHT = 96;
export const MIN_CARD_WIDTH = 112;

export interface ShelfLayout {
  /** Cards per page. */
  perPage: number;
  cardWidth: number;
  coverWidth: number;
  coverHeight: number;
}

/**
 * Card size for a shelf row of `width` × `height` px: the cover as tall as the row allows (within bounds) once the
 * text is placed under it, then as many cards per page as fit side by side, at least one.
 */
export function shelfLayout(width: number, height: number): ShelfLayout {
  const coverHeight = Math.max(
    MIN_COVER_HEIGHT,
    Math.min(MAX_COVER_HEIGHT, Math.floor(height - CARD_TEXT_HEIGHT)),
  );
  const coverWidth = Math.floor(coverHeight / 1.5);
  const cardWidth = Math.max(coverWidth, MIN_CARD_WIDTH);
  const perPage = Math.max(1, Math.floor((width + CARD_GAP) / (cardWidth + CARD_GAP)));
  return {
    perPage: perPage,
    cardWidth: cardWidth,
    coverWidth: coverWidth,
    coverHeight: coverHeight,
  };
}
