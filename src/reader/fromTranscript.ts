// Turns the engine transcript into the reader's page blocks.
import { GAME_COLUMNS, type Paragraph } from '../engines/transcript';
import type { ReaderBlock, ReaderImage, Run } from './paginator';

/** Leading spaces from which a line is laid out for the game's fixed-width screen (S1.23); fewer are kept as typed. */
export const LAYOUT_INDENT = 8;
/** Difference between the margins of a line centred with spaces (games round, or centre for a slightly other width). */
const CENTRE_SLACK = 4;

/**
 * How the reader shows a line the game laid out for its screen of `columns` characters with leading spaces (S1.23):
 * centred when its margins are about equal, its indent dropped when it is wider than that screen, else its indent as
 * a share of the text column (`indent`, in %), so it never wraps a run of spaces on a narrower screen. Null for a line
 * with fewer than LAYOUT_INDENT leading spaces (an indented paragraph, a poem: kept as typed) or several lines.
 */
export function lineLayout(
  text: string,
  columns: number = GAME_COLUMNS,
): { trim: number; align?: 'center'; indent?: number } | null {
  if (text.indexOf('\n') >= 0) return null;
  const body = text.replace(/^\s+/, '');
  const trim = text.length - body.length;
  const width = body.replace(/\s+$/, '').length;
  if (trim < LAYOUT_INDENT || !width) return null;
  const right = columns - trim - width;
  if (right < 0) return { trim: trim };
  if (Math.abs(trim - right) <= CENTRE_SLACK) return { trim: trim, align: 'center' };
  return { trim: trim, indent: Math.round((trim / columns) * 1000) / 10 };
}

/** `runs` without their first `count` characters. */
function dropStart(runs: Run[], count: number): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < runs.length; i++) {
    const text = runs[i].text;
    if (count >= text.length) {
      count -= text.length;
      continue;
    }
    out.push({ text: text.slice(count), style: runs[i].style });
    count = 0;
  }
  return out;
}

// One block per paragraph object: unchanged paragraphs keep their block, so the page turner reuses their metrics.
const cache = new WeakMap<Paragraph, ReaderBlock>();
// The block of a paragraph that starts a screen because a blank paragraph before it did (S1.16).
const screenCache = new WeakMap<Paragraph, ReaderBlock>();

function toBlock(paragraph: Paragraph): ReaderBlock {
  let block = cache.get(paragraph);
  if (!block && paragraph.image) {
    const ref = paragraph.image;
    const image: ReaderImage = { id: ref.image, width: ref.width, height: ref.height };
    if (ref.alt) image.alt = ref.alt;
    block = { kind: 'image', text: '', image: image };
    cache.set(paragraph, block);
  }
  if (!block) {
    let runs: Run[] = paragraph.runs.map((run) => ({ text: run.text, style: run.style }));
    let text = paragraph.text;
    const layout = paragraph.input || paragraph.box ? null : lineLayout(text);
    if (layout) {
      runs = dropStart(runs, layout.trim);
      text = text.slice(layout.trim);
    }
    block = { kind: paragraph.input ? 'input' : 'text', text: text, runs: runs };
    // A box (S1.23): its rows centred, as the game centred the box.
    if (paragraph.box || (layout && layout.align)) block.align = 'center';
    if (layout && layout.indent) block.indent = layout.indent;
    cache.set(paragraph, block);
  }
  if (paragraph.screen) block.screen = true;
  return block;
}

/** The block of `paragraph`, starting a screen. */
function screenBlock(paragraph: Paragraph): ReaderBlock {
  const block = toBlock(paragraph);
  if (block.screen) return block;
  let copy = screenCache.get(paragraph);
  if (!copy) {
    copy = { ...block, screen: true };
    screenCache.set(paragraph, copy);
  }
  return copy;
}

function isBlank(paragraph: Paragraph): boolean {
  return !paragraph.image && !paragraph.text.trim();
}

/**
 * Blank lines are dropped (paragraph spacing comes from the layout). With `hidePrompt`, a last paragraph that is only
 * the prompt (">") is left out: the command field stands for it until the command is echoed after it. Screens
 * replaced by the next one are left out unless `withReplaced` (the Transcript view). A screen start on a dropped
 * paragraph moves to the next block.
 */
export function readerBlocks(
  paragraphs: Paragraph[],
  hidePrompt: boolean,
  withReplaced?: boolean,
): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  let last = paragraphs.length - 1;
  while (last >= 0 && isBlank(paragraphs[last])) last--;
  let screen = false;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    if (paragraph.replaced && !withReplaced) continue;
    if (paragraph.screen) screen = true;
    if (isBlank(paragraph)) continue;
    if (hidePrompt && i === last && paragraph.text.trim() === '>') continue;
    blocks.push(screen ? screenBlock(paragraph) : toBlock(paragraph));
    screen = false;
  }
  return blocks;
}

/** Index of the last block starting a screen, or -1. */
export function lastScreenStart(blocks: ReaderBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].screen) return i;
  return -1;
}
