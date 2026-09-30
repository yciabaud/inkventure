// How many results fit the Library's list area (story S3.1): pages instead of scrolling, so the page size follows
// the screen.

/** Height of a list row in px (`.result` in ui.css). */
export const RESULT_ROW_HEIGHT = 56;
/** Gap between grid covers in px (`.tiles` in ui.css). */
export const GRID_GAP = 12;
/** Narrowest cover: sets the number of columns (4 on a 600 px wide e-reader, 2 on a phone). */
export const MIN_COVER_WIDTH = 120;
/** Title caption under each grid cover, in px: two lines and a margin (`.tile__title` in ui.css). */
export const CAPTION_HEIGHT = 38;
/** Covers are 2:3, like book covers. */
const COVER_RATIO = 1.5;

export interface GridLayout {
  columns: number;
  rows: number;
  coverWidth: number;
  coverHeight: number;
  perPage: number;
}

export function listPerPage(height: number): number {
  return Math.max(3, Math.floor(height / RESULT_ROW_HEIGHT));
}

/**
 * Covers for a `width` × `height` area: as many columns as fit covers of at least MIN_COVER_WIDTH, at least two
 * rows (covers shrink rather than showing a single row), as many rows as fit. Each cell holds a cover and its
 * title caption (IFDB cover art does not always show the title).
 */
export function gridLayout(width: number, height: number): GridLayout {
  const columns = Math.max(2, Math.floor((width + GRID_GAP) / (MIN_COVER_WIDTH + GRID_GAP)));
  let coverWidth = Math.floor((width - GRID_GAP * (columns - 1)) / columns);
  let coverHeight = Math.floor(coverWidth * COVER_RATIO);
  if (2 * (coverHeight + CAPTION_HEIGHT) + GRID_GAP > height) {
    coverHeight = Math.max(60, Math.floor((height - GRID_GAP) / 2) - CAPTION_HEIGHT);
    coverWidth = Math.floor(coverHeight / COVER_RATIO);
  }
  const cell = coverHeight + CAPTION_HEIGHT;
  const rows = Math.max(1, Math.floor((height + GRID_GAP) / (cell + GRID_GAP)));
  return {
    columns: columns,
    rows: rows,
    coverWidth: coverWidth,
    coverHeight: coverHeight,
    perPage: columns * rows,
  };
}
