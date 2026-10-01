// Reads line boxes from the DOM for the paginator. Blocks are laid out once, off screen but with the reader's
// exact classes and width; the top of each word tells where lines start. No DOM writes happen between reads, so
// the browser lays the text out a single time.
import { imageBox, type BlockMetrics, type LineBox, type ReaderBlock } from './paginator';

export function blockClass(kind: ReaderBlock['kind']): string {
  return 'reader__block reader__block--' + kind;
}

export function runClass(style: string): string {
  return 'reader__run reader__run--' + style;
}

/** Class of the picture (or of its stand-in while measuring) inside an image block. */
export const IMAGE_CLASS = 'reader__image';

/**
 * Creates the element a block (or fragment) is rendered with; the reader view renders the same markup. A picture is
 * a box of its display size (`imageBox`), so measuring never waits for it to load.
 */
function blockElement(block: ReaderBlock, width: number, imageMaxHeight: number): HTMLElement {
  if (block.image) {
    const div = document.createElement('div');
    div.className = blockClass(block.kind);
    const box = imageBox(block.image, width, imageMaxHeight);
    const picture = document.createElement('div');
    picture.className = IMAGE_CLASS;
    picture.style.width = box.width + 'px';
    picture.style.height = box.height + 'px';
    div.appendChild(picture);
    return div;
  }
  const p = document.createElement('p');
  p.className = blockClass(block.kind);
  if (block.runs) {
    for (let i = 0; i < block.runs.length; i++) {
      const span = document.createElement('span');
      span.className = runClass(block.runs[i].style);
      span.appendChild(document.createTextNode(block.runs[i].text));
      p.appendChild(span);
    }
  } else {
    p.appendChild(document.createTextNode(block.text));
  }
  return p;
}

/** The text nodes of `element` in order, with the offset of each in the element's text. */
function textNodes(
  element: Node,
  out: Array<{ node: Node; start: number }>,
  offset: number,
): number {
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) {
      out.push({ node: child, start: offset });
      offset += (child.nodeValue || '').length;
    } else {
      offset = textNodes(child, out, offset);
    }
  }
  return offset;
}

function lineBoxes(p: HTMLElement, text: string, range: Range | null): LineBox[] {
  const box = p.getBoundingClientRect();
  const nodes: Array<{ node: Node; start: number }> = [];
  textNodes(p, nodes, 0);
  if (!range || !nodes.length || typeof range.getBoundingClientRect !== 'function') {
    // No range geometry: keep the block whole.
    return [{ start: 0, height: box.height }];
  }

  const starts: number[] = [];
  const tops: number[] = [];
  let threshold = 0;
  let n = 0;
  const word = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = word.exec(text))) {
    // Words only move forward, and so does the text node holding their first character.
    while (n + 1 < nodes.length && nodes[n + 1].start <= match.index) n++;
    const local = match.index - nodes[n].start;
    range.setStart(nodes[n].node, local);
    range.setEnd(nodes[n].node, local + 1);
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
 * Pictures are scaled down to `width` × `imageMaxHeight` px.
 */
export function measureBlocks(
  host: HTMLElement,
  className: string,
  width: number,
  blocks: ReaderBlock[],
  imageMaxHeight: number,
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
    const p = blockElement(blocks[i], width, imageMaxHeight);
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
    if (!kinds[blocks[i].kind] && !blocks[i].image) {
      kinds[blocks[i].kind] = true;
      fonts.push(fontOf(elements[i]));
    }
  }

  host.removeChild(layer);
  return { metrics: metrics, fonts: fonts };
}
