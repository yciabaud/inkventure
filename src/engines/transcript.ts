// The game transcript as the reader sees it: paragraphs of styled runs plus the status line, built from the engine's
// OutputBlocks. Pure and immutable (a new transcript per update, unchanged paragraphs shared), so views can compare.
import type { ImageRef, OutputBlock, TextRun } from './engine';

export interface Paragraph {
  runs: TextRun[];
  text: string;
  /** Contains the player's echoed command. */
  input: boolean;
  /** A picture on a line of its own (then `runs` is empty). */
  image?: ImageRef;
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
    if (block.type === 'image') {
      const image: ImageRef = { image: block.image, width: block.width, height: block.height };
      if (block.alt) image.alt = block.alt;
      paragraphs.push({ runs: [], text: '', input: false, image: image });
      continue;
    }
    const last = paragraphs.length - 1;
    if (block.append && last >= 0 && !paragraphs[last].image) {
      paragraphs[last] = paragraph(paragraphs[last].runs.concat(block.runs));
    } else {
      paragraphs.push(paragraph(block.runs));
    }
  }
  return paragraphs === transcript.paragraphs && status === transcript.status
    ? transcript
    : { paragraphs: paragraphs, status: status };
}

/** A row of the status window split into its left part (location) and right part (score / turns, exits). */
export interface StatusRow {
  left: string;
  right: string;
}

function splitRow(row: string): StatusRow {
  const line = row.replace(/\s+$/, '');
  const match = /^\s*(.*?)\s{2,}(\S.*)$/.exec(line);
  if (match) return { left: match[1], right: match[2] };
  return { left: line.trim(), right: '' };
}

/** Status line text (its first row) split into its left part (location) and right part (score / turns). */
export function splitStatus(status: string[]): StatusRow {
  return splitRow(status[0] || '');
}

/** Rows of the status window shown in the reader's top zone at most (SPEC §3.6); the others go to the menu. */
export const MAX_STATUS_ROWS = 4;

/**
 * The status window as the top zone shows it: every non-empty row, split like the first one. Past `max` rows, the
 * zone shows `max - 1` of them and an ellipsis line (`overflow`), and the menu shows them all (`all`).
 */
export function statusRows(
  status: string[],
  max: number = MAX_STATUS_ROWS,
): { shown: StatusRow[]; all: StatusRow[]; overflow: boolean } {
  const all: StatusRow[] = [];
  for (let i = 0; i < status.length; i++) {
    if (/\S/.test(status[i] || '')) all.push(splitRow(status[i]));
  }
  const overflow = all.length > max;
  return { shown: overflow ? all.slice(0, max - 1) : all, all: all, overflow: overflow };
}
