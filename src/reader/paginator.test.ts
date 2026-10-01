import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  imageBox,
  pageFragments,
  pageIndexOf,
  paginate,
  type BlockMetrics,
  type Page,
  type ReaderBlock,
} from './paginator';

const LINE = 20;
const GAP = 10;

/** Mocked measurement: a block of `text` wrapped every `perLine` characters, each line LINE px high. */
function measure(blocks: ReaderBlock[], perLine: number, lineHeight = LINE): BlockMetrics[] {
  return blocks.map((block) => {
    const lines = [];
    for (let start = 0; start < Math.max(block.text.length, 1); start += perLine) {
      lines.push({ start: start, height: lineHeight });
    }
    return { lines: lines, gapAfter: GAP };
  });
}

function text(length: number, seed: string): ReaderBlock {
  let out = '';
  while (out.length < length) out += seed;
  return { kind: 'text', text: out.slice(0, length) };
}

/** Joins the fragments of every page, per block, to check nothing is skipped or repeated. */
function reassemble(blocks: ReaderBlock[], pages: Page[]): string[] {
  const out = blocks.map(() => '');
  let previous: { block: number; end: number } | null = null;
  for (const page of pages) {
    for (const fragment of pageFragments(blocks, page)) {
      if (previous && previous.block === fragment.block) expect(fragment.start).toBe(previous.end);
      out[fragment.block] += fragment.text;
      previous = { block: fragment.block, end: fragment.end };
    }
  }
  return out;
}

describe('paginate', () => {
  it('puts everything on one page when it fits', () => {
    const blocks = [text(30, 'a'), text(30, 'b')];
    // 3 lines + gap + 3 lines = 130 px.
    const pages = paginate(measure(blocks, 10), 130);
    expect(pages).toEqual([{ start: { block: 0, offset: 0 }, end: { block: 2, offset: 0 } }]);
  });

  it('breaks between blocks when the next line does not fit', () => {
    const blocks = [text(30, 'a'), text(30, 'b'), text(30, 'c')];
    // Page of 130 px: blocks 0 and 1 (130 px); block 2 starts page 2 and the gap is not carried over.
    const pages = paginate(measure(blocks, 10), 130);
    expect(pages.map((p) => p.start)).toEqual([
      { block: 0, offset: 0 },
      { block: 2, offset: 0 },
    ]);
    expect(pages[1].end).toEqual({ block: 3, offset: 0 });
  });

  it('splits a long paragraph between lines, at the offset of the first line of the next page', () => {
    const blocks = [text(10, 'a'), text(100, 'b')];
    // Page of 100 px: block 0 (20) + gap (10) + 3 lines (60) = 90; the 4th line (offset 30) starts page 2.
    const pages = paginate(measure(blocks, 10), 100);
    expect(pages[0].end).toEqual({ block: 1, offset: 30 });
    expect(pages[1].start).toEqual({ block: 1, offset: 30 });
    // 5 lines per page after that.
    expect(pages[2].start).toEqual({ block: 1, offset: 80 });
    expect(pages).toHaveLength(3);
  });

  it('never skips or duplicates text', () => {
    const blocks: ReaderBlock[] = [];
    for (let i = 0; i < 40; i++)
      blocks.push(text(5 + ((i * 37) % 180), String.fromCharCode(97 + (i % 26))));
    for (const height of [45, 100, 137, 333, 1000]) {
      for (const perLine of [7, 23, 60]) {
        const pages = paginate(measure(blocks, perLine), height);
        expect(reassemble(blocks, pages)).toEqual(blocks.map((b) => b.text));
        for (let i = 1; i < pages.length; i++) expect(pages[i].start).toEqual(pages[i - 1].end);
      }
    }
  });

  it('keeps every page within the page height', () => {
    const blocks = [text(95, 'a'), text(12, 'b'), text(230, 'c'), text(40, 'd')];
    const metrics = measure(blocks, 10);
    const height = 110;
    for (const page of paginate(metrics, height)) {
      let y = 0;
      const fragments = pageFragments(blocks, page);
      fragments.forEach((fragment, i) => {
        if (i > 0) y += GAP;
        const lines = metrics[fragment.block].lines.filter(
          (line) => line.start >= fragment.start && line.start < Math.max(fragment.end, 1),
        );
        y += lines.length * LINE;
      });
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it('tolerates fractional measurements', () => {
    const blocks = [text(50, 'a')];
    // 5 lines of 27.1 px = 135.5 px fit a 135 px page within rounding.
    expect(paginate(measure(blocks, 10, 27.1), 135)).toHaveLength(1);
    expect(paginate(measure(blocks, 10, 27.1), 130)).toHaveLength(2);
  });

  it('gives a line taller than the page a page of its own instead of looping', () => {
    const blocks = [text(10, 'a'), text(10, 'b'), text(10, 'c')];
    const metrics = measure(blocks, 10);
    metrics[1].lines[0].height = 500;
    const pages = paginate(metrics, 100);
    expect(pages.map((p) => p.start.block)).toEqual([0, 1, 2]);
  });

  it('returns one empty page without text', () => {
    const pages = paginate([], 500);
    expect(pages).toHaveLength(1);
    expect(pageFragments([], pages[0])).toEqual([]);
  });
});

describe('position preservation', () => {
  const blocks: ReaderBlock[] = [];
  for (let i = 0; i < 30; i++) blocks.push(text(20 + ((i * 53) % 140), 'x'));

  it('finds the page showing a position', () => {
    const pages = paginate(measure(blocks, 10), 200);
    pages.forEach((page, i) => {
      expect(pageIndexOf(pages, page.start)).toBe(i);
      if (comparePositions(page.start, page.end) < 0) {
        const inside = { block: page.start.block, offset: page.start.offset + 1 };
        expect(pageIndexOf(pages, inside)).toBe(i);
      }
    });
    expect(pageIndexOf(pages, { block: 0, offset: 0 })).toBe(0);
  });

  it('keeps the reading position across re-pagination, and returns to the same page', () => {
    const narrow = paginate(measure(blocks, 10), 200);
    const wide = paginate(measure(blocks, 25), 400);
    // The reader is on page 5 of the narrow layout; the wide layout shows the same text.
    const anchor = narrow[5].start;
    const onWide = wide[pageIndexOf(wide, anchor)];
    expect(comparePositions(onWide.start, anchor)).toBeLessThanOrEqual(0);
    expect(comparePositions(anchor, onWide.end)).toBeLessThan(0);
    // Back to the narrow layout with the same anchor: the same page as before.
    expect(pageIndexOf(narrow, anchor)).toBe(5);
  });
});

describe('pageFragments', () => {
  it('slices the first and last blocks of a page', () => {
    const blocks: ReaderBlock[] = [
      { kind: 'text', text: 'Hello there' },
      { kind: 'input', text: '> look' },
      { kind: 'text', text: 'A small room.' },
    ];
    const page = { start: { block: 0, offset: 6 }, end: { block: 2, offset: 2 } };
    expect(pageFragments(blocks, page)).toEqual([
      { block: 0, start: 6, end: 11, kind: 'text', text: 'there' },
      { block: 1, start: 0, end: 6, kind: 'input', text: '> look' },
      { block: 2, start: 0, end: 2, kind: 'text', text: 'A ' },
    ]);
  });
});

describe('keeping turns together', () => {
  // Blocks of 3 lines (60 px) with 10 px gaps; blocks 2 and 4 start turns.
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((i) => text(30, String(i)));
  const metrics = measure(blocks, 10);
  const turns = blocks.map((_, i) => i === 2 || i === 4);

  it('starts a new page at a turn that does not fit the rest of the page but fits a page', () => {
    // Page of 180 px: blocks 0-1 take 130 px; turn 2-3 (130 px) does not fit after them, but fits a page.
    const pages = paginate(metrics, 180, turns);
    expect(pages[1].start).toEqual({ block: 2, offset: 0 });
    // Without the rule, turn 2 would start at the bottom of page 1 and be split.
    expect(paginate(metrics, 180)[1].start).toEqual({ block: 2, offset: 20 });
  });

  it('splits a turn longer than a page as usual', () => {
    // Turn 4-6 is 200 px: longer than a 180 px page, so it is split between lines.
    const pages = paginate(metrics, 180, turns);
    expect(pages[2].start).toEqual({ block: 4, offset: 20 });
    expect(reassemble(blocks, pages)).toEqual(blocks.map((b) => b.text));
  });

  it('never skips or duplicates text', () => {
    for (const height of [70, 130, 180, 200, 333]) {
      const pages = paginate(metrics, height, turns);
      expect(reassemble(blocks, pages)).toEqual(blocks.map((b) => b.text));
      for (let i = 1; i < pages.length; i++) expect(pages[i].start).toEqual(pages[i - 1].end);
    }
  });
});

describe('a shorter last page (room for the command bar)', () => {
  // Five blocks of 2 lines (40 px) with 10 px gaps: 240 px in all.
  const blocks = [0, 1, 2, 3, 4].map((i) => text(20, String(i)));
  const metrics = measure(blocks, 10);

  function used(pages: Page[], index: number): number {
    let y = 0;
    pageFragments(blocks, pages[index]).forEach((fragment, i) => {
      if (i > 0) y += GAP;
      y += Math.ceil((fragment.end - fragment.start) / 10) * LINE;
    });
    return y;
  }

  it('keeps the pages when the last one already fits the smaller height', () => {
    // 200 px pages: blocks 0-3 (190 px), then block 4 (40 px) fits in 100 px.
    expect(paginate(metrics, 200, undefined, 100)).toEqual(paginate(metrics, 200));
  });

  it('lays the end out again when the last page is too tall, leaving earlier pages alone', () => {
    // 150 px pages: blocks 0-2 (140 px), then blocks 3-4 (90 px) do not fit in 60 px.
    const normal = paginate(metrics, 150);
    const pages = paginate(metrics, 150, undefined, 60);
    expect(normal).toHaveLength(2);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toEqual(normal[0]);
    expect(used(pages, pages.length - 1)).toBeLessThanOrEqual(60);
    expect(reassemble(blocks, pages)).toEqual(blocks.map((b) => b.text));
  });

  it('never skips or duplicates text, and the last page always fits', () => {
    for (const height of [70, 110, 150, 200, 333]) {
      for (const last of [40, 50, 69, height]) {
        const pages = paginate(metrics, height, undefined, last);
        expect(reassemble(blocks, pages)).toEqual(blocks.map((b) => b.text));
        expect(used(pages, pages.length - 1)).toBeLessThanOrEqual(Math.max(last, LINE));
      }
    }
  });
});

describe('pictures', () => {
  it('sizes a picture from its known size: scaled to the column width, capped to the page height', () => {
    expect(imageBox({ width: 300, height: 200 }, 500, 700)).toEqual({ width: 300, height: 200 });
    expect(imageBox({ width: 600, height: 400 }, 300, 700)).toEqual({ width: 300, height: 200 });
    expect(imageBox({ width: 600, height: 400 }, 600, 100)).toEqual({ width: 150, height: 100 });
    expect(imageBox({ width: 1000, height: 3 }, 300, 700)).toEqual({ width: 300, height: 1 });
    expect(imageBox({ width: 0, height: 0 }, 300, 700)).toEqual({ width: 1, height: 1 });
  });

  it('lays an image block out as one unbreakable line, moved to the next page when it does not fit', () => {
    const picture: ReaderBlock = {
      kind: 'image',
      text: '',
      image: { id: 1, width: 600, height: 400 },
    };
    const blocks = [text(30, 'a'), picture, text(10, 'b')];
    const box = imageBox(picture.image!, 300, 150);
    const metrics = measure(blocks, 10);
    metrics[1] = { lines: [{ start: 0, height: box.height }], gapAfter: GAP };
    // 60 px of text, a gap, then the 150 px picture: too tall for the rest of a 200 px page.
    const pages = paginate(metrics, 200);
    expect(pages.map((p) => p.start)).toEqual([
      { block: 0, offset: 0 },
      { block: 1, offset: 0 },
    ]);
    const second = pageFragments(blocks, pages[1]);
    expect(second.map((f) => f.kind)).toEqual(['image', 'text']);
    expect(second[0].image).toBe(picture.image);
    expect(pageFragments(blocks, pages[0]).map((f) => f.kind)).toEqual(['text']);
  });
});
