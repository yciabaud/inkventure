// Rendering survey (story S7.3): what a game sends through GlkOte that the reader drops or changes. Pure functions over
// the GlkOte updates recorded while a game plays (scripts/survey/play.ts), so they are unit-tested on recorded updates.

/** The parts of a GlkOte update the detectors read (see src/engines/glkote-bridge/bridge.ts). */
export interface RawUpdate {
  type?: string;
  windows?: Array<{ id: number; type: string; gridwidth?: number; gridheight?: number }> | null;
  content?: Array<{
    id: number;
    clear?: boolean;
    text?: Array<{ append?: boolean; content?: unknown[] }>;
    lines?: Array<{ line: number; content?: unknown[] }>;
    draw?: unknown[];
  }>;
  input?: Array<{ id: number; type?: string; hyperlink?: boolean }>;
  timer?: number | null;
  specialinput?: { type: string } | null;
}

/** An update and the step of the script it answered ("intro", "look", "help: n"…). */
export interface Recorded {
  step: string;
  update: RawUpdate;
}

export type FindingKind =
  | 'grid-styles'
  | 'windows'
  | 'graphics'
  | 'timer'
  | 'hyperlinks'
  | 'glyphs'
  | 'wide-fixed'
  | 'upper-screen'
  | 'tall-upper'
  | 'no-output'
  | 'error'
  | 'timeout'
  | 'load';

/** Something the reader may show wrong, first seen at `step`. */
export interface Finding {
  kind: FindingKind;
  step: string;
  detail: string;
}

/**
 * Code points of the fonts the app bundles: the "latin" subset of Literata and Source Sans 3 (@fontsource, the
 * `unicode-range` of their latin CSS; checked against node_modules in detect.test.ts). Others are drawn in a fallback
 * font, or not at all on an e-reader without one.
 */
export const FONT_RANGES: Array<[number, number]> = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** Fixed-width lines longer than this wrap on the baseline Kindle (600 px wide, default text size). */
export const WIDE_FIXED = 40;

/**
 * A fixed-width line laid out in columns (a map, a table, a drawing), which wrapping breaks, unlike prose in a fixed
 * font: a gap of 3 spaces or more inside it, or a third of its characters neither letters, digits nor spaces.
 */
export function laidOut(line: string): boolean {
  const text = line.trim();
  if (/\S\s{3,}\S/.test(text)) return true;
  const symbols = text.replace(/[\p{L}\p{N}\s.,;:!?'"()-]/gu, '').length;
  return symbols * 3 >= text.length;
}

export function inFonts(code: number): boolean {
  for (let i = 0; i < FONT_RANGES.length; i++) {
    if (code >= FONT_RANGES[i][0] && code <= FONT_RANGES[i][1]) return true;
  }
  return false;
}

/** The styled runs of a GlkOte content array (`["style", "text", …]` or `{style, text}` objects). */
export function runsOf(
  content: unknown[] | undefined,
): Array<{ style: string; text: string; link: boolean }> {
  const runs: Array<{ style: string; text: string; link: boolean }> = [];
  if (!content) return runs;
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (typeof item === 'string') {
      const next = content[i + 1];
      runs.push({ style: item, text: typeof next === 'string' ? next : '', link: false });
      i++;
    } else if (item && typeof item === 'object' && 'text' in item) {
      const run = item as { style?: string; text?: string; hyperlink?: unknown };
      runs.push({
        style: run.style || 'normal',
        text: run.text || '',
        link: run.hyperlink !== undefined,
      });
    }
  }
  return runs;
}

/** Collects the findings of one game, each kind once (with the step where it first showed). */
export class Findings {
  readonly list: Finding[] = [];
  private readonly seen: Record<string, Finding> = {};

  add(kind: FindingKind, step: string, detail: string): void {
    const found = this.seen[kind];
    if (found) {
      // Keep the widest detail of a kind measured in numbers (the longest line, the most windows).
      if (/^\d+/.test(detail) && parseInt(detail, 10) > parseInt(found.detail, 10))
        found.detail = detail;
      return;
    }
    const finding = { kind: kind, step: step, detail: detail };
    this.seen[kind] = finding;
    this.list.push(finding);
  }
}

/** The findings in recorded updates: windows, styles, timers, hyperlinks, glyphs and fixed-width text. */
export function analyse(records: Recorded[], findings: Findings = new Findings()): Findings {
  const glyphs: string[] = [];
  let glyphStep = '';
  for (const { step, update } of records) {
    if (update.windows) {
      const count = (type: string) => update.windows!.filter((w) => w.type === type).length;
      if (count('grid') > 1) findings.add('windows', step, count('grid') + ' grid windows');
      if (count('buffer') > 1) findings.add('windows', step, count('buffer') + ' buffer windows');
      const graphics = update.windows.filter((w) => w.type === 'graphics');
      if (graphics.length) findings.add('graphics', step, graphics.length + ' graphics window(s)');
    }
    if (update.timer) findings.add('timer', step, update.timer + ' ms');
    if (update.input) {
      for (const input of update.input) {
        if (input.hyperlink) findings.add('hyperlinks', step, 'hyperlink input requested');
      }
    }
    for (const part of update.content || []) {
      if (part.draw && part.draw.length)
        findings.add('graphics', step, 'draws in a graphics window');
      const texts: string[] = [];
      if (part.lines) {
        // A grid window: rows in different styles (a selection in reverse video, a highlighted title).
        const styles: Record<string, boolean> = {};
        for (const line of part.lines) {
          for (const run of runsOf(line.content)) {
            // Every row of a grid is fixed-width: "preformatted" looks the same as "normal" there.
            if (run.text.trim()) styles[run.style === 'preformatted' ? 'normal' : run.style] = true;
            if (run.link) findings.add('hyperlinks', step, 'links in the upper window');
            texts.push(run.text);
          }
        }
        const names = Object.keys(styles);
        if (names.length > 1) findings.add('grid-styles', step, names.sort().join(', '));
      }
      for (const line of part.text || []) {
        for (const run of runsOf(line.content)) {
          if (run.link) findings.add('hyperlinks', step, 'links in the text');
          if (run.style === 'preformatted') {
            for (const row of run.text.split('\n')) {
              const width = row.replace(/\s+$/, '').length;
              if (width > WIDE_FIXED && laidOut(row)) {
                findings.add(
                  'wide-fixed',
                  step,
                  width + ' characters: "' + row.trim().slice(0, 40) + '"',
                );
              }
            }
          }
          texts.push(run.text);
        }
      }
      for (const text of texts) {
        for (const char of text) {
          const code = char.codePointAt(0) || 0;
          if (inFonts(code) || glyphs.indexOf(char) >= 0) continue;
          if (!glyphs.length) glyphStep = step;
          glyphs.push(char);
        }
      }
    }
  }
  if (glyphs.length) {
    const shown = glyphs
      .slice(0, 12)
      .map((c) => c + ' U+' + (c.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0'));
    findings.add('glyphs', glyphStep, shown.join(', ') + (glyphs.length > 12 ? ' …' : ''));
  }
  return findings;
}
