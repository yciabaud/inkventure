// Story-file scan (story S7.4): the display features a story file uses, read from its code without playing it.
import { executable, formatOf } from './blorb.ts';
import { inFonts } from './detect.ts';
import { constant, scanGlulx, type GInstruction } from './glulx.ts';
import { disassemble, unpackRoutine, type Instruction } from './zcode.ts';

export type Feature =
  | 'quote-box'
  | 'upper-window'
  | 'clear-screen'
  | 'timed-input'
  | 'sound'
  | 'colour'
  | 'char-font'
  | 'fixed-font'
  | 'unicode'
  | 'graphics-window'
  | 'grid-window'
  | 'buffer-window'
  | 'timer'
  | 'hyperlinks'
  | 'images'
  | 'version-6';

export type Counts = Partial<Record<Feature, number>>;

/** A routine or function with display features, and its fingerprint (to tell library code from the game's). */
export interface Unit {
  hash: number;
  counts: Counts;
}

/** What a story file holds, before the libraries' code is told apart by its frequency over all the games. */
export interface StoryFacts {
  format: 'zmachine' | 'glulx';
  version: number;
  /** Routines or functions read. */
  size: number;
  /** Routines or functions with display features, each with its fingerprint; counted when not library code. */
  units: Unit[];
  /** Counted wherever the code is: windows the libraries never open, quote boxes, version 6. */
  counts: Counts;
  /** Characters the game can print that the bundled fonts do not have (the library's are told apart later). */
  glyphs: number[];
}

function add(counts: Counts, feature: Feature, n = 1): void {
  counts[feature] = (counts[feature] || 0) + n;
}

/** FNV-1a hash of a string: a routine's fingerprint. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A Z-machine routine's fingerprint: its opcodes and operand kinds, without addresses (same code, same print). */
function zFingerprint(code: Instruction[]): number {
  return hash(code.map((i) => i.form + i.op + i.operands.map((o) => o.type[0]).join('')).join(' '));
}

const isConst = (i: Instruction, n: number, value?: number) => {
  const o = i.operands[n];
  return !!o && o.type !== 'var' && (value === undefined || o.value === value);
};

/** The display features of one Z-machine routine. */
function zCounts(code: Instruction[]): Counts {
  const counts: Counts = {};
  for (const i of code) {
    const k = i.form + ':' + i.op;
    // read_char 1 time routine / aread text parse time routine, with a time that is not 0.
    if (k === 'VAR:22' && i.operands.length >= 2 && !isConst(i, 1, 0)) add(counts, 'timed-input');
    if (k === 'VAR:4' && i.operands.length >= 3 && !isConst(i, 2, 0)) add(counts, 'timed-input');
    // sound_effect 1 and 2 are beeps.
    if (k === 'VAR:21' && !(isConst(i, 0) && i.operands[0].value <= 2)) add(counts, 'sound');
    // set_colour with a real colour (0 is "current", 1 "default").
    if (k === '2OP:27' && i.operands.some((o) => o.type === 'var' || o.value >= 2))
      add(counts, 'colour');
    if (k === 'EXT:13') add(counts, 'colour');
    if (k === 'EXT:4' && isConst(i, 0, 3)) add(counts, 'char-font');
    if (k === 'EXT:4' && isConst(i, 0, 4)) add(counts, 'fixed-font');
    if (k === 'VAR:11' && isConst(i, 0, 1)) add(counts, 'upper-window');
    if (k === 'VAR:13' && (isConst(i, 0, 0xffff) || isConst(i, 0, 0xfffe)))
      add(counts, 'clear-screen');
    if (k === 'EXT:11') add(counts, 'unicode');
  }
  return counts;
}

/**
 * Inform's veneer routine for `box` (a quotation in the upper window): it splits the window, draws each line at the
 * cursor in reverse video, with buffering off. The status line routines do not turn buffering off.
 */
function isZBox(code: Instruction[]): boolean {
  const has = (k: string) => code.some((i) => i.form + ':' + i.op === k);
  return has('VAR:10') && has('VAR:11') && has('VAR:17') && has('VAR:15') && has('VAR:18');
}

function zFacts(mem: Uint8Array): StoryFacts {
  const d = disassemble(mem);
  const header = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
  const counts: Counts = {};
  if (d.version === 6) add(counts, 'version-6');
  const boxes: Record<number, boolean> = {};
  for (const [addr, code] of d.routines) if (isZBox(code)) boxes[addr] = true;
  const zUnits: Unit[] = [];
  const glyphs: number[] = [];
  const glyph = (c: number) => {
    if (!inFonts(c) && glyphs.indexOf(c) < 0) glyphs.push(c);
  };
  for (const code of d.routines.values()) {
    for (const i of code) {
      // A box statement: a call to the veneer's box routine.
      const call =
        (i.form === 'VAR' && (i.op === 0 || i.op === 25)) || (i.form === '2OP' && i.op >= 25);
      if (call && isConst(i, 0) && boxes[unpackRoutine(i.operands[0].value, d.version, header)])
        add(counts, 'quote-box');
      if (i.form === 'EXT' && i.op === 11 && isConst(i, 0)) glyph(i.operands[0].value);
    }
    const unit = zCounts(code);
    if (Object.keys(unit).length) zUnits.push({ hash: zFingerprint(code), counts: unit });
  }
  if (d.unicode) d.unicode.forEach(glyph);
  return {
    format: 'zmachine',
    version: d.version,
    size: d.routines.size,
    units: zUnits,
    counts: counts,
    glyphs,
  };
}

// Glk function numbers (glk.h) and window types.
const GLK = {
  windowOpen: 0x23,
  stylehintSet: 0xb0,
  requestTimer: 0xd6,
  imageDraw: 0xe1,
  imageDrawScaled: 0xe2,
  setBackground: 0xec,
  schannelPlay: 0xf8,
  schannelPlayExt: 0xf9,
  schannelPlayMulti: 0xfa,
  setHyperlink: 0x100,
  requestHyperlink: 0x102,
};
const WINTYPE = { textBuffer: 3, textGrid: 4, graphics: 5 };
// Rocks of the Inform libraries' windows: main, status, quotation box.
const ROCK = { main: 201, status: 202, quote: 203 };

/** The arguments of a call, from the pushes before it (the first argument is pushed last), or its inline operands. */
function callArgs(code: GInstruction[], k: number, count: number): Array<number | null> {
  const args: Array<number | null> = [];
  for (let j = k - 1; j >= 0 && args.length < count; j--) {
    const ins = code[j];
    if (ins.op !== 0x40 || ins.operands[1].mode !== 8) break;
    args.push(constant(ins.operands[0]));
  }
  while (args.length < count) args.push(null);
  return args;
}

function glulxFacts(mem: Uint8Array): StoryFacts {
  const scan = scanGlulx(mem);
  const counts: Counts = {};
  // The libraries' one-line wrappers: glk_xxx(…) → @glk N.
  const wrappers: Record<number, number> = {};
  for (const [addr, code] of scan.functions) {
    const glk = code.filter((i) => i.op === 0x130);
    if (glk.length === 1 && code.length <= 6 && constant(glk[0].operands[0]) !== null) {
      wrappers[addr] = constant(glk[0].operands[0])!;
    }
  }
  const calls: Array<{ fn: number; selector: number; args: Array<number | null> }> = [];
  for (const [addr, code] of scan.functions) {
    if (wrappers[addr] !== undefined) continue;
    code.forEach((ins, k) => {
      if (ins.op === 0x130 && constant(ins.operands[0]) !== null) {
        const argc = constant(ins.operands[1]);
        calls.push({
          fn: addr,
          selector: constant(ins.operands[0])!,
          args: callArgs(code, k, argc || 0),
        });
      } else if (
        (ins.op === 0x30 || ins.op === 0x34) &&
        wrappers[constant(ins.operands[0]) ?? -1] !== undefined
      ) {
        const argc = constant(ins.operands[1]) || 0;
        calls.push({
          fn: addr,
          selector: wrappers[constant(ins.operands[0])!],
          args: callArgs(code, k, argc),
        });
      } else if (
        ins.op >= 0x160 &&
        ins.op <= 0x163 &&
        wrappers[constant(ins.operands[0]) ?? -1] !== undefined
      ) {
        const args = ins.operands.slice(1, ins.operands.length - 1).map(constant);
        calls.push({ fn: addr, selector: wrappers[constant(ins.operands[0])!], args: args });
      }
    });
  }
  // The library's box routine opens the quotation window: calls to it are box statements.
  const boxes: Record<number, boolean> = {};
  for (const call of calls) {
    if (call.selector === GLK.windowOpen && call.args[4] === ROCK.quote) boxes[call.fn] = true;
  }
  for (const code of scan.functions.values()) {
    for (const ins of code) {
      const call = ins.op === 0x30 || ins.op === 0x34 || (ins.op >= 0x160 && ins.op <= 0x163);
      if (call && boxes[constant(ins.operands[0]) ?? -1]) add(counts, 'quote-box');
    }
  }
  // Windows the libraries never open: counted wherever the call is. The other calls count in the game's own code.
  const perFunction: Record<number, Counts> = {};
  for (const { fn, selector, args } of calls) {
    if (selector === GLK.windowOpen) {
      const type = args[3];
      const rock = args[4];
      if (type === WINTYPE.graphics) add(counts, 'graphics-window');
      if (type === WINTYPE.textGrid && rock !== ROCK.status && rock !== ROCK.quote)
        add(counts, 'grid-window');
      if (type === WINTYPE.textBuffer && rock !== ROCK.main && rock !== ROCK.quote)
        add(counts, 'buffer-window');
    }
    const unit = perFunction[fn] || (perFunction[fn] = {});
    if (selector === GLK.requestTimer && args[0] !== 0) add(unit, 'timer');
    if (selector === GLK.setHyperlink || selector === GLK.requestHyperlink) add(unit, 'hyperlinks');
    const play = [GLK.schannelPlay, GLK.schannelPlayExt, GLK.schannelPlayMulti];
    if (play.indexOf(selector) >= 0) add(unit, 'sound');
    if (selector === GLK.imageDraw || selector === GLK.imageDrawScaled) add(unit, 'images');
    // Style hints for text and background colours, reverse video; Gargoyle's colour extensions.
    if (selector === GLK.stylehintSet && args[2] !== null && args[2] >= 7 && args[2] <= 9)
      add(unit, 'colour');
    if (selector === GLK.setBackground || (selector >= 0x1100 && selector <= 0x1103))
      add(unit, 'colour');
  }
  const units: Unit[] = [];
  for (const key of Object.keys(perFunction)) {
    const fn = Number(key);
    if (!Object.keys(perFunction[fn]).length) continue;
    const code = scan.functions.get(fn)!;
    const print = code.map((i) => i.op + ':' + i.operands.map((o) => o.mode).join('')).join(' ');
    units.push({ hash: hash(print), counts: perFunction[fn] });
  }
  const glyphs: number[] = [];
  for (const c of scan.chars) if (!inFonts(c)) glyphs.push(c);
  for (const code of scan.functions.values()) {
    for (const ins of code) {
      const c = ins.op === 0x73 ? constant(ins.operands[0]) : null;
      if (c !== null && c > 0 && !inFonts(c) && glyphs.indexOf(c) < 0) glyphs.push(c);
    }
  }
  return {
    format: 'glulx',
    version: 0,
    size: scan.functions.size,
    units: units,
    counts: counts,
    glyphs: glyphs,
  };
}

/** The facts of a story file (Blorb or not). */
export function storyFacts(bytes: Uint8Array): StoryFacts {
  const story = executable(bytes);
  const format = formatOf(story);
  if (format === 'glulx') return glulxFacts(story);
  if (format === 'zmachine') return zFacts(story);
  throw new Error('not a Z-machine or Glulx story');
}

/** What the libraries hold, told apart by frequency over all the games scanned. */
export interface Library {
  /** Fingerprints of routines and functions found in many games of their format. */
  units: Set<number>;
  /** Characters printed by many games (the runtime messages of a compiler's library). */
  glyphs: Set<number>;
}

/**
 * A game's feature counts: what counts wherever it is (windows, boxes, version 6), plus the game's own routines and
 * functions (their fingerprint is not the library's), plus its characters outside the fonts that are not the library's.
 */
export function features(facts: StoryFacts, library: Library): Counts {
  const counts: Counts = { ...facts.counts };
  for (const unit of facts.units) {
    if (library.units.has(unit.hash)) continue;
    for (const key of Object.keys(unit.counts) as Feature[]) add(counts, key, unit.counts[key]!);
  }
  const glyphs = ownGlyphs(facts, library);
  if (glyphs.length) add(counts, 'unicode', glyphs.length);
  return counts;
}

/** The game's characters outside the fonts, without the library's. */
export function ownGlyphs(facts: StoryFacts, library: Library): number[] {
  return facts.glyphs.filter((c) => !library.glyphs.has(c));
}

/**
 * Library code: routines and functions whose fingerprint is in at least `share` of the games of their format (and in
 * 3 games), and characters printed by that many of them.
 */
export function libraryOf(all: StoryFacts[], share = 0.01): Library {
  const units = new Set<number>();
  const glyphs = new Set<number>();
  for (const format of ['zmachine', 'glulx']) {
    const games = all.filter((f) => f.format === format);
    const min = Math.max(3, Math.ceil(games.length * share));
    const frequent = (lists: number[][], into: Set<number>) => {
      const seen: Record<number, number> = {};
      for (const list of lists) for (const h of new Set(list)) seen[h] = (seen[h] || 0) + 1;
      for (const key of Object.keys(seen)) if (seen[+key] >= min) into.add(+key);
    };
    frequent(
      games.map((g) => g.units.map((u) => u.hash)),
      units,
    );
    frequent(
      games.map((g) => g.glyphs),
      glyphs,
    );
  }
  return { units: units, glyphs: glyphs };
}
