// The game transcript as the reader sees it: paragraphs of styled runs plus the status line, built from the engine's
// OutputBlocks. Pure and immutable (a new transcript per update, unchanged paragraphs shared), so views can compare.
//
// Screens (story S1.16): when the game clears its main window, the next paragraph starts a new screen, which the
// reader opens on a fresh page. A screen reached by key presses only (no command echoed in it: a menu being browsed)
// is replaced by the next one: its paragraphs stay in the transcript, marked `replaced`, for the Transcript view, but
// the game view leaves them out.
//
// Boxes (story S1.23): a box the game draws in its upper window under the status line (Inform's quote box, a title
// card) is shown in the text, at the start of the turn, as the window sits above the turn's text. It is kept as
// paragraphs once the game redraws its upper window without it.
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
  /** A group of rows of a box the game drew in its upper window (S1.23): one line per row, shown centred. */
  box?: boolean;
}

export interface Transcript {
  paragraphs: Paragraph[];
  status: string[];
  /** Screens started so far (main window cleared): a new one means the reader opens on it. */
  screens: number;
  /** The window was cleared and nothing printed since: the next paragraph starts a screen. */
  cleared?: boolean;
  /** The lines of a text window other than the main and status ones (Inform's quote box in Glulx). */
  quote?: string[];
  /** The box the upper window or the quote window shows now, not yet in `paragraphs` (`withBox` places it). */
  box?: Box;
  /** The text of a box the game redrew on a later turn: a part of its status window, not a box. */
  fixedBox?: string;
}

/** A box shown now: its paragraphs, and when it appeared (paragraphs then, and commands echoed from the last one). */
export interface Box {
  paragraphs: Paragraph[];
  at: number;
  inputs: number;
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
  if (from && from.box) result.box = true;
  return result;
}

/** A copy of `p` with its flags changed. */
function flagged(p: Paragraph, flags: { screen?: boolean; replaced?: boolean }): Paragraph {
  const copy: Paragraph = { runs: p.runs, text: p.text, input: p.input };
  if (p.image) copy.image = p.image;
  if (flags.screen !== undefined ? flags.screen : p.screen) copy.screen = true;
  if (flags.replaced !== undefined ? flags.replaced : p.replaced) copy.replaced = true;
  if (p.box) copy.box = true;
  return copy;
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
    out.push(p.replaced ? p : flagged(p, { replaced: true }));
  }
  return out;
}

export function applyOutput(transcript: Transcript, blocks: OutputBlock[]): Transcript {
  let paragraphs = transcript.paragraphs;
  let status = transcript.status;
  let screens = transcript.screens;
  let cleared = !!transcript.cleared;
  let quote = transcript.quote;
  let box = transcript.box;
  let fixedBox = transcript.fixedBox;
  let copied = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'status' || block.type === 'quote') {
      if (block.type === 'status') status = block.lines;
      else quote = block.lines.length ? block.lines : undefined;
      let next = boxParagraphs(quote && quote.some(nonBlank) ? quote : splitUpper(status).box);
      if (next && boxText(next) === fixedBox) next = undefined;
      if (box && next && boxText(next) === boxText(box.paragraphs)) {
        // Drawn again after a command: a part of the status window (Metamorphoses' humours), shown with it.
        if (inputsFrom(paragraphs, box.at) > box.inputs) {
          fixedBox = boxText(box.paragraphs);
          box = undefined;
        }
        continue;
      }
      // The box the game showed is gone (or another one replaces it): it stays in the text. Not a menu's rows (the
      // main window cleared and still empty, S1.22).
      if (box && !cleared) {
        paragraphs = insertBox(paragraphs, box.paragraphs);
        copied = true;
      }
      box = next
        ? {
            paragraphs: next,
            at: paragraphs.length,
            inputs: inputsFrom(paragraphs, paragraphs.length),
          }
        : undefined;
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
      if (block.box) next.box = true;
      if (cleared) next.screen = true;
      cleared = false;
      paragraphs.push(next);
    }
  }
  if (
    paragraphs === transcript.paragraphs &&
    status === transcript.status &&
    screens === transcript.screens &&
    cleared === !!transcript.cleared &&
    quote === transcript.quote &&
    box === transcript.box &&
    fixedBox === transcript.fixedBox
  ) {
    return transcript;
  }
  const next: Transcript = { paragraphs: paragraphs, status: status, screens: screens };
  if (cleared) next.cleared = true;
  if (quote) next.quote = quote;
  if (box) next.box = box;
  if (fixedBox !== undefined) next.fixedBox = fixedBox;
  return next;
}

function nonBlank(row: string | undefined): boolean {
  return /\S/.test(row || '');
}

/**
 * The upper window's rows split into the status line (its first rows, down to the first blank one) and a box below
 * it (S1.23): the rows after that blank row, when one at least has text and all those that do are indented (a box is
 * centred; a map or a list of exits starts at the margin). No box when the status line is taller than the top zone
 * shows.
 */
export function splitUpper(rows: string[]): { status: string[]; box: string[] } {
  let top = 0;
  while (top < rows.length && nonBlank(rows[top])) top++;
  let any = false;
  for (let i = top; i < rows.length; i++) {
    if (!nonBlank(rows[i])) continue;
    if (top > MAX_STATUS_ROWS || !/^\s{2}/.test(rows[i])) return { status: rows, box: [] };
    any = true;
  }
  return any ? { status: rows.slice(0, top), box: rows.slice(top) } : { status: rows, box: [] };
}

/**
 * The paragraphs of a box: one per group of rows between blank rows (they set the spacing), each row a line, without
 * the spaces that placed it. Undefined when no row has text.
 */
export function boxParagraphs(rows: string[]): Paragraph[] | undefined {
  const out: Paragraph[] = [];
  let lines: string[] = [];
  for (let i = 0; i <= rows.length; i++) {
    if (i < rows.length && nonBlank(rows[i])) {
      lines.push(rows[i].trim());
    } else if (lines.length) {
      const text = lines.join('\n');
      out.push({ runs: [{ text: text, style: 'normal' }], text: text, input: false, box: true });
      lines = [];
    }
  }
  return out.length ? out : undefined;
}

function boxText(box: Paragraph[]): string {
  return box.map((p) => p.text).join('\n\n');
}

/** Commands echoed from paragraph `at - 1` on (the prompt a command is echoed after comes before the box). */
function inputsFrom(paragraphs: Paragraph[], at: number): number {
  let count = 0;
  for (let i = Math.max(0, at - 1); i < paragraphs.length; i++) if (paragraphs[i].input) count++;
  return count;
}

/**
 * Where a box goes in `paragraphs`: at the start of the turn, after the last command echoed, or at the start of the
 * screen when the game cleared its window since (the box then starts the screen).
 */
function boxPlace(paragraphs: Paragraph[]): number {
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (paragraphs[i].screen) return i;
    if (paragraphs[i].input) return i + 1;
  }
  return 0;
}

function insertBox(paragraphs: Paragraph[], box: Paragraph[]): Paragraph[] {
  const at = boxPlace(paragraphs);
  const out = paragraphs.slice(0, at);
  const opens = at < paragraphs.length && !!paragraphs[at].screen;
  for (let i = 0; i < box.length; i++)
    out.push(i === 0 && opens ? flagged(box[i], { screen: true }) : box[i]);
  for (let i = at; i < paragraphs.length; i++) {
    out.push(i === at && opens ? flagged(paragraphs[i], { screen: false }) : paragraphs[i]);
  }
  return out;
}

/**
 * The transcript's paragraphs with the box the game shows now in its place (S1.23), for the game and Transcript views.
 * None while the main window is cleared and empty: the upper window is a menu (S1.22).
 */
export function withBox(transcript: Transcript): Paragraph[] {
  return transcript.box && !transcript.cleared
    ? insertBox(transcript.paragraphs, transcript.box.paragraphs)
    : transcript.paragraphs;
}

/** A row of the status window split into its left part (location) and right part (score / turns, exits). */
export interface StatusRow {
  left: string;
  right: string;
  /** The game centred it (a title): one part, as many spaces before as after it (S1.22). */
  center?: boolean;
}

/**
 * Whether the game centred `row` in the window's width (its rows come padded with spaces to that width): a single
 * part, at least 2 spaces before it and about as many after it.
 */
export function centredRow(row: string): boolean {
  const text = row.trim();
  if (!text || /\S\s{2,}\S/.test(text)) return false;
  const before = row.length - row.replace(/^\s+/, '').length;
  const after = row.length - row.replace(/\s+$/, '').length;
  return before >= 2 && Math.abs(before - after) <= 2;
}

function splitRow(row: string): StatusRow {
  // Leading spaces are an indent, not the gap before a right part.
  const line = row.trim();
  const match = /^(.*?)\s{2,}(\S.*)$/.exec(line);
  if (match) return { left: match[1], right: match[2] };
  const split: StatusRow = { left: line, right: '' };
  if (centredRow(row)) split.center = true;
  return split;
}

/** Status line text (its first row) split into its left part (location) and right part (score / turns). */
export function splitStatus(status: string[]): StatusRow {
  return splitRow(status[0] || '');
}

/** Width of the game's screen, in characters: the engines are loaded with it, the status window is that wide. */
export const GAME_COLUMNS = 80;

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
