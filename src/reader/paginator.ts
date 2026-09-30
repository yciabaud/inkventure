// Paginator (SPEC §3.6): lays measured text blocks out into pages that exactly fit the text area.
// Pure functions over measurements, so they are unit-tested with mocked metrics; measure.ts reads them from the DOM.

/** A styled piece of a paragraph (Glk style name: `emphasized`, `header`, `input`…). */
export interface Run {
  text: string;
  style: string;
}

/**
 * A paragraph of output. `input` is an echoed player command. `runs`, when present, split `text` into styled pieces
 * (their texts joined are exactly `text`).
 */
export interface ReaderBlock {
  kind: 'text' | 'input';
  text: string;
  runs?: Run[];
}

/** A place in the text: character `offset` in block `block`. */
export interface Position {
  block: number;
  offset: number;
}

/** One rendered line of a block: the offset of its first character and its height in px. */
export interface LineBox {
  start: number;
  height: number;
}

export interface BlockMetrics {
  lines: LineBox[];
  /** Vertical space between this block and the next one, in px. */
  gapAfter: number;
}

/** A page covers the text from `start` (inclusive) to `end` (exclusive). */
export interface Page {
  start: Position;
  end: Position;
}

/** The part of a block shown on a page: `text` is the block's text from `start` to `end`. */
export interface Fragment {
  block: number;
  start: number;
  end: number;
  kind: ReaderBlock['kind'];
  text: string;
  runs?: Run[];
}

// Measurements are fractional; tolerate rounding so a line that exactly fits is not pushed to the next page.
const EPSILON = 0.5;

export function comparePositions(a: Position, b: Position): number {
  return a.block !== b.block ? a.block - b.block : a.offset - b.offset;
}

function blockHeight(metrics: BlockMetrics): number {
  let height = 0;
  for (let l = 0; l < metrics.lines.length; l++) height += metrics.lines[l].height;
  return height;
}

/**
 * Splits blocks into pages of `pageHeight` px. Blocks are split between lines when they do not fit; a line taller
 * than the page gets a page of its own (it is clipped rather than looping forever). There is always at least one page.
 *
 * `groupStarts[b]` marks blocks that start a group kept together when possible (a turn: the echoed command and the
 * game's reply). A group that does not fit in the rest of the page but fits on a page of its own starts a new page,
 * so the player reads the whole reply, with the command bar, without turning the page.
 *
 * `lastPageHeight` (≤ `pageHeight`) is the room on the last page, which shows the command bar: when the text left
 * for it is taller, it is laid out again from that page on in pages of `lastPageHeight`. Earlier pages are unchanged.
 */
export function paginate(
  metrics: BlockMetrics[],
  pageHeight: number,
  groupStarts?: boolean[],
  lastPageHeight?: number,
): Page[] {
  const first = layOut(metrics, groupStarts, () => pageHeight);
  if (lastPageHeight === undefined || lastPageHeight >= pageHeight) return first.pages;
  if (first.lastHeight <= lastPageHeight + EPSILON) return first.pages;
  const from = first.pages.length - 1;
  return layOut(metrics, groupStarts, (page) => (page < from ? pageHeight : lastPageHeight)).pages;
}

/** Lays the blocks out with `heightOf(page)` px for each page; also returns the height used on the last page. */
function layOut(
  metrics: BlockMetrics[],
  groupStarts: boolean[] | undefined,
  heightOf: (page: number) => number,
): { pages: Page[]; lastHeight: number } {
  const pages: Page[] = [];
  let start: Position = { block: 0, offset: 0 };
  let y = 0;
  let pageHeight = heightOf(0);

  function breakAt(position: Position) {
    pages.push({ start: start, end: position });
    start = position;
    y = 0;
    pageHeight = heightOf(pages.length);
  }

  for (let b = 0; b < metrics.length; b++) {
    const lines = metrics[b].lines;
    const gap = b > 0 && y > 0 ? metrics[b - 1].gapAfter : 0;
    if (y > 0 && groupStarts && groupStarts[b]) {
      let group = blockHeight(metrics[b]);
      for (let g = b + 1; g < metrics.length && !groupStarts[g]; g++) {
        group += metrics[g - 1].gapAfter + blockHeight(metrics[g]);
      }
      if (y + gap + group > pageHeight + EPSILON && group <= heightOf(pages.length + 1) + EPSILON) {
        breakAt({ block: b, offset: 0 });
      }
    }
    if (y > 0) y += gap;
    for (let l = 0; l < lines.length; l++) {
      const height = lines[l].height;
      if (y > 0 && y + height > pageHeight + EPSILON) {
        breakAt({ block: b, offset: l === 0 ? 0 : lines[l].start });
      }
      y += height;
    }
  }
  pages.push({ start: start, end: { block: metrics.length, offset: 0 } });
  return { pages: pages, lastHeight: y };
}

/** Index of the page showing `position` (the last page starting at or before it). */
export function pageIndexOf(pages: Page[], position: Position): number {
  for (let i = pages.length - 1; i > 0; i--) {
    if (comparePositions(pages[i].start, position) <= 0) return i;
  }
  return 0;
}

/** The runs covering characters `start` to `end` of their joined text. */
export function sliceRuns(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  let offset = 0;
  for (let i = 0; i < runs.length && offset < end; i++) {
    const from = Math.max(start - offset, 0);
    const to = Math.min(end - offset, runs[i].text.length);
    if (to > from) out.push({ text: runs[i].text.slice(from, to), style: runs[i].style });
    offset += runs[i].text.length;
  }
  return out;
}

/** The block fragments shown on `page`, in reading order. */
export function pageFragments(blocks: ReaderBlock[], page: Page): Fragment[] {
  const fragments: Fragment[] = [];
  const last = Math.min(page.end.block, blocks.length - 1);
  for (let b = page.start.block; b <= last; b++) {
    const text = blocks[b].text;
    const start = b === page.start.block ? page.start.offset : 0;
    const end = b === page.end.block ? page.end.offset : text.length;
    if (end <= start && !(text.length === 0 && b < page.end.block)) continue;
    const fragment: Fragment = {
      block: b,
      start: start,
      end: end,
      kind: blocks[b].kind,
      text: text.slice(start, end),
    };
    const runs = blocks[b].runs;
    if (runs) fragment.runs = sliceRuns(runs, start, end);
    fragments.push(fragment);
  }
  return fragments;
}
