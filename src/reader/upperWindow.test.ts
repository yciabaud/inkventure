import { describe, expect, it } from 'vitest';
import { centredRow, statusRows } from '../engines/transcript';
import { isUpperScreen, upperBlocks, upperRows, upperTitle } from './upperWindow';

const pad = (row: string) => (row + ' '.repeat(80)).slice(0, 80);

// Lost Pig's HELP (Release 2), as ZVM draws it on an 80-column screen.
const LOST_PIG = [
  '                                   Lost Pig                                     ',
  ' N = next subject                                                  P = previous ',
  ' RETURN = read subject                                          Q = resume game ',
  '                                                                                ',
  '                                                                                ',
  '   > About this game                                                            ',
  '     How to play Interactive Fiction                                            ',
  '     Special commands for this game                                             ',
  '     Credits                                                                    ',
  '     Hints                                                                      ',
];

describe('upper-window menus (S1.22)', () => {
  it('reads the rows of a menu: a centred title, a legend in two parts, the selected subject', () => {
    expect(upperRows(LOST_PIG)).toEqual([
      { text: 'Lost Pig', center: true, selected: false },
      { text: 'N = next subject   P = previous', center: false, selected: false },
      { text: 'RETURN = read subject   Q = resume game', center: false, selected: false },
      { text: '> About this game', center: false, selected: true },
      { text: 'How to play Interactive Fiction', center: false, selected: false },
      { text: 'Special commands for this game', center: false, selected: false },
      { text: 'Credits', center: false, selected: false },
      { text: 'Hints', center: false, selected: false },
    ]);
  });

  it('shows the menu in the text area only while the game waits for a key, after clearing its main window', () => {
    expect(isUpperScreen(LOST_PIG, true, true)).toBe(true);
    expect(isUpperScreen(LOST_PIG, false, true)).toBe(false);
    expect(isUpperScreen(LOST_PIG, true, false)).toBe(false);
  });

  it('leaves an ordinary status window in the top zone (a status line, a compass, a few counters)', () => {
    const status = [pad(' Outside                     Score: 0'), '', ''];
    expect(isUpperScreen(status, true, true)).toBe(false);
    // Bronze: region and compass on 3 rows.
    const bronze = [
      pad(' Entrance Hall                 N'),
      pad(' Main Castle               W . E'),
      pad(' Rooms searched: 2/55       SW S'),
    ];
    expect(isUpperScreen(bronze, true, true)).toBe(false);
    // Four rows still fit in the top zone.
    expect(isUpperScreen(bronze.concat(pad(' Turns: 3')), true, true)).toBe(false);
  });

  it('gives the text area one block per row: the title goes to the top zone, the selected subject in bold', () => {
    const rows = upperRows(LOST_PIG);
    expect(upperTitle(rows)).toBe('Lost Pig');
    const blocks = upperBlocks(rows);
    expect(blocks.map((b) => b.text)).toEqual([
      'N = next subject   P = previous',
      'RETURN = read subject   Q = resume game',
      '> About this game',
      'How to play Interactive Fiction',
      'Special commands for this game',
      'Credits',
      'Hints',
    ]);
    expect(blocks[2].runs).toEqual([{ text: '> About this game', style: 'subheader' }]);
    expect(blocks[3].runs).toEqual([{ text: 'How to play Interactive Fiction', style: 'normal' }]);
    expect(blocks.every((b) => !b.align)).toBe(true);
  });

  it('keeps a centred row that is not the first one centred, and has no title when the first row is not centred', () => {
    const rows = upperRows([
      pad(' Help'),
      pad('                                   Contents'),
      pad(' N = next'),
      pad(' P = previous'),
      pad('   > One'),
      pad('     Two'),
    ]);
    expect(upperTitle(rows)).toBeNull();
    const blocks = upperBlocks(rows);
    expect(blocks[0].text).toBe('Help');
    expect(blocks[1]).toMatchObject({ text: 'Contents', align: 'center' });
  });
});

describe('centred status rows (S1.22)', () => {
  it('knows a centred row from an indented one or a row in two parts', () => {
    expect(centredRow(LOST_PIG[0])).toBe(true);
    expect(centredRow(LOST_PIG[5])).toBe(false);
    expect(centredRow(LOST_PIG[1])).toBe(false);
    expect(centredRow(pad(' Outside'))).toBe(false);
    expect(centredRow('')).toBe(false);
  });

  it('splits an indented row as one left part, not as a right part (the menu list of status rows)', () => {
    const rows = statusRows(LOST_PIG).all;
    expect(rows[0]).toEqual({ left: 'Lost Pig', right: '', center: true });
    expect(rows[1]).toEqual({ left: 'N = next subject', right: 'P = previous' });
    expect(rows[3]).toEqual({ left: '> About this game', right: '' });
  });
});
