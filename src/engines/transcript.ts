// The game transcript as the reader sees it: paragraphs of styled runs plus the status line, built from the engine's
// OutputBlocks. Pure and immutable (a new transcript per update, unchanged paragraphs shared), so views can compare.
import type { OutputBlock, TextRun } from './engine';

export interface Paragraph {
  runs: TextRun[];
  text: string;
  /** Contains the player's echoed command. */
  input: boolean;
}

export interface Transcript {
  paragraphs: Paragraph[];
  status: string[];
}

export const EMPTY_TRANSCRIPT: Transcript = { paragraphs: [], status: [] };

function paragraph(runs: TextRun[]): Paragraph {
  let text = '';
  let input = false;
  for (let i = 0; i < runs.length; i++) {
    text += runs[i].text;
    if (runs[i].style === 'input') input = true;
  }
  return { runs: runs, text: text, input: input };
}

export function applyOutput(transcript: Transcript, blocks: OutputBlock[]): Transcript {
  let paragraphs = transcript.paragraphs;
  let status = transcript.status;
  let copied = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'status') {
      status = block.lines;
      continue;
    }
    if (block.type === 'clear') {
      // The transcript keeps everything: a paginated reader has no screen to clear (the next text starts below).
      continue;
    }
    if (!copied) {
      paragraphs = paragraphs.slice(0);
      copied = true;
    }
    const last = paragraphs.length - 1;
    if (block.append && last >= 0) {
      paragraphs[last] = paragraph(paragraphs[last].runs.concat(block.runs));
    } else {
      paragraphs.push(paragraph(block.runs));
    }
  }
  return paragraphs === transcript.paragraphs && status === transcript.status
    ? transcript
    : { paragraphs: paragraphs, status: status };
}

/** Status line text split into its left part (location) and right part (score / turns). */
export function splitStatus(status: string[]): { left: string; right: string } {
  const line = (status[0] || '').replace(/\s+$/, '');
  const match = /^\s*(.*?)\s{2,}(\S.*)$/.exec(line);
  if (match) return { left: match[1], right: match[2] };
  return { left: line.trim(), right: '' };
}
