// Menus drawn in the upper window (SPEC §3.6, story S1.22): Inform's menu library draws a whole menu (a title, a legend,
// the subjects with the selected one marked ">") in the status window and waits for a key. The top zone shows only a
// few rows of it, so the reader shows such a screen in the text area instead.
import { centredRow, MAX_STATUS_ROWS } from '../engines/transcript';
import type { ReaderBlock } from './paginator';

/** A row of the upper window as the text area shows it. */
export interface UpperRow {
  text: string;
  /** Centred by the game (a title). */
  center: boolean;
  /** The selected entry of a menu (marked with ">"). */
  selected: boolean;
}

/** The non-empty rows of the upper window; a row in two parts (a legend) keeps both, apart. */
export function upperRows(status: string[]): UpperRow[] {
  const rows: UpperRow[] = [];
  for (let i = 0; i < status.length; i++) {
    const row = status[i] || '';
    const text = row.trim();
    if (!text) continue;
    rows.push({
      text: text.replace(/(\S)\s{2,}(?=\S)/g, '$1   '),
      center: centredRow(row),
      selected: /^>\s/.test(text),
    });
  }
  return rows;
}

/**
 * Whether the upper window holds a screen of its own to show in the text area: the game waits for a key, its main
 * window was cleared with nothing printed since (a menu), and the upper window has more rows than the top zone shows.
 * An ordinary status window (a compass, a few counters) stays in the top zone.
 */
export function isUpperScreen(status: string[], cleared: boolean, awaitingKey: boolean): boolean {
  return awaitingKey && cleared && upperRows(status).length > MAX_STATUS_ROWS;
}

/**
 * The text area's blocks for an upper-window screen, without its first row when that is a centred title (the top zone
 * shows it): one block per row, centred rows centred, the selected entry in bold.
 */
export function upperBlocks(rows: UpperRow[]): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i === 0 && row.center) continue;
    const block: ReaderBlock = {
      kind: 'text',
      text: row.text,
      runs: [{ text: row.text, style: row.selected ? 'subheader' : 'normal' }],
    };
    if (row.center) block.align = 'center';
    blocks.push(block);
  }
  return blocks;
}

/** The title the top zone shows over an upper-window screen: its first row when centred, else null. */
export function upperTitle(rows: UpperRow[]): string | null {
  return rows.length && rows[0].center ? rows[0].text : null;
}
