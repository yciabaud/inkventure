// Turns the engine transcript into the reader's page blocks.
import type { Paragraph } from '../engines/transcript';
import type { ReaderBlock, ReaderImage } from './paginator';

// One block per paragraph object: unchanged paragraphs keep their block, so the page turner reuses their metrics.
const cache = new WeakMap<Paragraph, ReaderBlock>();

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
  return block;
}

function isBlank(paragraph: Paragraph): boolean {
  return !paragraph.image && !paragraph.text.trim();
}

/**
 * Blank lines are dropped (paragraph spacing comes from the layout). With `hidePrompt`, a last paragraph that is only
 * the prompt (">") is left out: the command field stands for it until the command is echoed after it.
 */
export function readerBlocks(paragraphs: Paragraph[], hidePrompt: boolean): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  let last = paragraphs.length - 1;
  while (last >= 0 && isBlank(paragraphs[last])) last--;
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].text;
    if (isBlank(paragraphs[i])) continue;
    if (hidePrompt && i === last && text.trim() === '>') continue;
    blocks.push(toBlock(paragraphs[i]));
  }
  return blocks;
}
