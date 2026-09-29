// Turns the engine transcript into the reader's page blocks.
import type { Paragraph } from '../engines/transcript';
import type { ReaderBlock } from './paginator';

// One block per paragraph object: unchanged paragraphs keep their block, so the page turner reuses their metrics.
const cache = new WeakMap<Paragraph, ReaderBlock>();

function toBlock(paragraph: Paragraph): ReaderBlock {
  let block = cache.get(paragraph);
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

/**
 * Blank lines are dropped (paragraph spacing comes from the layout). With `hidePrompt`, a last paragraph that is only
 * the prompt (">") is left out: the command field stands for it until the command is echoed after it.
 */
export function readerBlocks(paragraphs: Paragraph[], hidePrompt: boolean): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  let last = paragraphs.length - 1;
  while (last >= 0 && !paragraphs[last].text.trim()) last--;
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].text;
    if (!text.trim()) continue;
    if (hidePrompt && i === last && text.trim() === '>') continue;
    blocks.push(toBlock(paragraphs[i]));
  }
  return blocks;
}
