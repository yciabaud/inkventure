// Turns the engine transcript into the reader's page blocks.
import type { Paragraph } from '../engines/transcript';
import type { ReaderBlock, ReaderImage } from './paginator';

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
    block = {
      kind: paragraph.input ? 'input' : 'text',
      text: paragraph.text,
      runs: paragraph.runs.map((run) => ({ text: run.text, style: run.style })),
    };
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
