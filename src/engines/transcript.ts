// The game transcript as the reader sees it: paragraphs of styled runs plus the status line, built from the engine's
// OutputBlocks. Pure and immutable (a new transcript per update, unchanged paragraphs shared), so views can compare.
//
// Screens (story S1.16): when the game clears its main window, the next paragraph starts a new screen, which the
// reader opens on a fresh page. A screen reached by key presses only (no command echoed in it: a menu being browsed)
// is replaced by the next one: its paragraphs stay in the transcript, marked `replaced`, for the Transcript view, but
// the game view leaves them out.
import type { ImageRef, OutputBlock, TextRun } from './engine';

export interface Paragraph {
  runs: TextRun[];
  text: string;
  /** Contains the player's echoed command. */
  input: boolean;
  /** A picture on a line of its own (then `runs` is empty). */
  image?: ImageRef;
  /** Starts a screen: the game cleared its main window before it. */
  screen?: boolean;
  /** Part of a screen replaced by the next one (reached by key presses only): left out of the game view. */
  replaced?: boolean;
}

export interface Transcript {
  paragraphs: Paragraph[];
  status: string[];
  /** Screens started so far (main window cleared): a new one means the reader opens on it. */
  screens: number;
  /** The window was cleared and nothing printed since: the next paragraph starts a screen. */
  cleared?: boolean;
}

export const EMPTY_TRANSCRIPT: Transcript = { paragraphs: [], status: [], screens: 0 };

function paragraph(runs: TextRun[], from?: Paragraph): Paragraph {
  let text = '';
  let input = false;
  for (let i = 0; i < runs.length; i++) {
    text += runs[i].text;
    if (runs[i].style === 'input') input = true;
  }
  const result: Paragraph = { runs: runs, text: text, input: input };
  if (from && from.screen) result.screen = true;
  if (from && from.replaced) result.replaced = true;
  return result;
}

/**
 * The paragraphs of the current screen (from the last one starting a screen) marked `replaced`, if the player reached
 * it with key presses only (no command echoed in it). The first screen of the game (no clear before it) is kept.
 */
function replaceKeyScreen(paragraphs: Paragraph[]): Paragraph[] {
  let start = paragraphs.length - 1;
  while (start >= 0 && !paragraphs[start].screen) {
    if (paragraphs[start].input) return paragraphs;
    start--;
  }
  if (start < 0 || paragraphs[start].input || paragraphs[start].replaced) return paragraphs;
  const out = paragraphs.slice(0, start);
  for (let i = start; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.replaced) out.push(p);
    else {
      const copy: Paragraph = { runs: p.runs, text: p.text, input: p.input, replaced: true };
      if (p.image) copy.image = p.image;
      if (p.screen) copy.screen = true;
      out.push(copy);
    }
  }
  return out;
}

export function applyOutput(transcript: Transcript, blocks: OutputBlock[]): Transcript {
  let paragraphs = transcript.paragraphs;
  let status = transcript.status;
  let screens = transcript.screens;
  let cleared = !!transcript.cleared;
  let copied = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'status') {
      status = block.lines;
      continue;
    }
    if (block.type === 'clear') {
      // A new screen: the next paragraph starts it. The screen it replaces is kept unless reached by keys only.
      if (!cleared) {
        paragraphs = replaceKeyScreen(paragraphs);
        copied = paragraphs !== transcript.paragraphs;
        cleared = true;
        screens++;
      }
      continue;
    }
    if (!copied) {
      paragraphs = paragraphs.slice(0);
      copied = true;
    }
    if (block.type === 'image') {
      const image: ImageRef = { image: block.image, width: block.width, height: block.height };
      if (block.alt) image.alt = block.alt;
      const picture: Paragraph = { runs: [], text: '', input: false, image: image };
      if (cleared) picture.screen = true;
      cleared = false;
      paragraphs.push(picture);
      continue;
    }
    const last = paragraphs.length - 1;
    if (block.append && !cleared && last >= 0 && !paragraphs[last].image) {
      paragraphs[last] = paragraph(paragraphs[last].runs.concat(block.runs), paragraphs[last]);
    } else {
      const next = paragraph(block.runs);
      if (cleared) next.screen = true;
      cleared = false;
      paragraphs.push(next);
    }
  }
  if (
    paragraphs === transcript.paragraphs &&
    status === transcript.status &&
    screens === transcript.screens &&
    cleared === !!transcript.cleared
  ) {
    return transcript;
  }
  const next: Transcript = { paragraphs: paragraphs, status: status, screens: screens };
  if (cleared) next.cleared = true;
  return next;
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
