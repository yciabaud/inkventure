// Paginator (SPEC §3.6): lays measured text blocks out into pages that exactly fit the text area.
// Pure functions over measurements, so they are unit-tested with mocked metrics; measure.ts reads them from the DOM.

/** A paragraph of output. `input` is an echoed player command. */
export interface ReaderBlock {
  kind: 'text' | 'input';
  text: string;
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
}

// Measurements are fractional; tolerate rounding so a line that exactly fits is not pushed to the next page.
const EPSILON = 0.5;

export function comparePositions(a: Position, b: Position): number {
  return a.block !== b.block ? a.block - b.block : a.offset - b.offset;
}

/**
 * Splits blocks into pages of `pageHeight` px. Blocks are split between lines when they do not fit; a line taller
 * than the page gets a page of its own (it is clipped rather than looping forever). There is always at least one page.
 */
export function paginate(metrics: BlockMetrics[], pageHeight: number): Page[] {
  const pages: Page[] = [];
  let start: Position = { block: 0, offset: 0 };
  let y = 0;

  for (let b = 0; b < metrics.length; b++) {
    const lines = metrics[b].lines;
    if (b > 0 && y > 0) y += metrics[b - 1].gapAfter;
    for (let l = 0; l < lines.length; l++) {
      const height = lines[l].height;
      if (y > 0 && y + height > pageHeight + EPSILON) {
        const breakAt = { block: b, offset: l === 0 ? 0 : lines[l].start };
        pages.push({ start: start, end: breakAt });
        start = breakAt;
        y = 0;
      }
      y += height;
    }
  }
  pages.push({ start: start, end: { block: metrics.length, offset: 0 } });
  return pages;
}

/** Index of the page showing `position` (the last page starting at or before it). */
export function pageIndexOf(pages: Page[], position: Position): number {
  for (let i = pages.length - 1; i > 0; i--) {
    if (comparePositions(pages[i].start, position) <= 0) return i;
  }
  return 0;
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
    fragments.push({
      block: b,
      start: start,
      end: end,
      kind: blocks[b].kind,
      text: text.slice(start, end),
    });
  }
  return fragments;
}
