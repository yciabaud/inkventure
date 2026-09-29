// Reads line boxes from the DOM for the paginator. Blocks are laid out once, off screen but with the reader's
// exact classes and width; the top of each word tells where lines start. No DOM writes happen between reads, so
// the browser lays the text out a single time.
import type { BlockMetrics, LineBox, ReaderBlock } from './paginator';

export function blockClass(kind: ReaderBlock['kind']): string {
  return 'reader__block reader__block--' + kind;
}

/** Creates the element a block (or fragment) is rendered with; the reader view renders the same markup. */
function blockElement(block: ReaderBlock): HTMLElement {
  const p = document.createElement('p');
  p.className = blockClass(block.kind);
  p.appendChild(document.createTextNode(block.text));
  return p;
}

function lineBoxes(p: HTMLElement, text: string, range: Range | null): LineBox[] {
  const box = p.getBoundingClientRect();
  const node = p.firstChild;
  if (!range || !node || typeof range.getBoundingClientRect !== 'function') {
    // No range geometry: keep the block whole.
    return [{ start: 0, height: box.height }];
  }

  const starts: number[] = [];
  const tops: number[] = [];
  let threshold = 0;
  const word = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = word.exec(text))) {
    range.setStart(node, match.index);
    range.setEnd(node, match.index + 1);
    const rect = range.getBoundingClientRect();
    if (!threshold) threshold = Math.max(rect.height / 2, 1);
    if (!tops.length || rect.top > tops[tops.length - 1] + threshold) {
      starts.push(match.index);
      tops.push(rect.top);
    }
  }
  if (!starts.length) return [{ start: 0, height: box.height }];

  // Line boundaries relative to the block's top: shift glyph tops so the first line starts at 0.
  const shift = tops[0] - box.top;
  const lines: LineBox[] = [];
  for (let i = 0; i < starts.length; i++) {
    const top = i === 0 ? 0 : tops[i] - box.top - shift;
    const bottom = i + 1 < starts.length ? tops[i + 1] - box.top - shift : box.height;
    lines.push({ start: i === 0 ? 0 : starts[i], height: bottom - top });
  }
  return lines;
}

export interface Measurement {
  metrics: BlockMetrics[];
  /** CSS `font` values the blocks are set in (one per block kind), for `document.fonts.check()` / `load()`. */
  fonts: string[];
}

function fontOf(element: HTMLElement): string {
  const style = window.getComputedStyle(element);
  return style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
}

/**
 * Measures `blocks` inside `host` (the text area), in a hidden layer of width `width` px styled like `className`.
 */
export function measureBlocks(
  host: HTMLElement,
  className: string,
  width: number,
  blocks: ReaderBlock[],
): Measurement {
  const layer = document.createElement('div');
  layer.className = className;
  layer.setAttribute('aria-hidden', 'true');
  const style = layer.style;
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '0';
  style.width = width + 'px';
  style.maxWidth = 'none';
  style.margin = '0';

  const elements: HTMLElement[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const p = blockElement(blocks[i]);
    elements.push(p);
    layer.appendChild(p);
  }
  host.appendChild(layer);

  const range = document.createRange ? document.createRange() : null;
  const metrics: BlockMetrics[] = [];
  const fonts: string[] = [];
  const kinds: Record<string, boolean> = {};
  let previousBottom = 0;
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    if (i > 0) metrics[i - 1].gapAfter = Math.max(rect.top - previousBottom, 0);
    metrics.push({ lines: lineBoxes(elements[i], blocks[i].text, range), gapAfter: 0 });
    previousBottom = rect.bottom;
    if (!kinds[blocks[i].kind]) {
      kinds[blocks[i].kind] = true;
      fonts.push(fontOf(elements[i]));
    }
  }

  host.removeChild(layer);
  return { metrics: metrics, fonts: fonts };
}
