// Command chips for the commands a game names in capitals (SPEC §3.6, story S1.19): "type HELP", "(For help, use
// "HELP".)", "The *GUIDE* command", "[PS 1]". A heuristic over the text since the last command, so that a player on an
// e-reader taps the command instead of typing it.

import type { Chip, VerbTable } from './verbs';

/** At most this many chips; other commands can still be tapped in the text or typed. */
export const MAX_NAMED = 4;

/** A paragraph as the reader has it: its text and, when known, its styled runs (headings are not read). */
export interface NamedSource {
  text: string;
  runs?: Array<{ text: string; style: string }>;
}

// A run of 1–3 words in capitals (each of at least 2 letters), optionally followed by a number ("PS 1").
const RUN =
  /(^|[^A-Za-zÀ-ÿ0-9'’])((?:[A-ZÀ-Þ][A-ZÀ-Þ'’-]+)(?: +[A-ZÀ-Þ][A-ZÀ-Þ'’-]+){0,2}(?: +\d{1,3})?)(?![A-Za-zÀ-ÿ0-9'’-])/g;
// Words that announce a command just before it: "type HELP", "try ABOUT", "use "HELP"", "tapez AIDE".
const CUE =
  /\b(type|typing|typed|try|trying|enter|say|use|using|command|tapez|taper|tape|essayez|essaie|entrez|dites|commande|utilisez)\s*["'“‘[*(]*$/i;
// "type HELP or ABOUT", "type WAKE UP if you feel sleepy, or LOGBOOK": a command listed after one with a cue, in
// the same sentence.
const OR = /(\bor|\bou|\band|\bet|,)\s*["'“‘[*(]*$/i;
const SENTENCE_END = /[.!?;]/;
// Marks around a command: "HELP", 'HELP', [HELP], *GUIDE*, (HELP).
const OPEN = /["'“‘[*(]\s*$/;
const CLOSE = /^\s*["'”’\]*)]/;
// "The GUIDE command", "la commande AIDE".
const COMMAND_AFTER = /^\s*["'”’\]*)]*\s+(command|commande)\b/i;
// Commands games name without a cue that are worth a chip on their own ("CREDITS and COPYRIGHT are available").
const META =
  /^(HELP|HINT|HINTS|ABOUT|CREDITS|COPYRIGHT|INFO|INTRO|INSTRUCTIONS|VERBS|MENU|GUIDE|AMUSING|AIDE|INDICE|INDICES|CRÉDITS|CREDITS|APROPOS)$/;
// What the reader's menu already does, or what would stop or reset the game: never a chip.
const RESERVED =
  /^(SAVE|RESTORE|RESTART|QUIT|Q|UNDO|SCRIPT|UNSCRIPT|TRANSCRIPT|SAUVER|SAUVEGARDER|CHARGER|RECOMMENCER|QUITTER|ANNULER)$/;
// Roman numerals of two letters or more (chapters, acts): "ACT II", "PART IV".
const ROMAN =
  /^(?=[IVXLC]{2})X{0,3}(IX|IV|V?I{0,3})$|^(?=[IVXLC]{2})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
// After the run, a placeholder for an object or a person: the chip fills the field instead of sending ("TALK TO
// someone" → "talk to ").
const PLACEHOLDER =
  /^\s+(someone|somebody|something|anyone|anything|object|person|thing|quelqu['’]un|quelque chose|objet|personne)\b/i;
const HEADINGS = /^(header|subheader)$/;

interface Found {
  label: string;
  strong: boolean;
  needsObject: boolean;
  order: number;
}

/** The commands the command bar already offers (directions, verbs, their usual abbreviations), upper case. */
function barCommands(table: VerbTable): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const add = (word: string) => (out[word.toUpperCase()] = true);
  for (const d of table.directions) {
    add(d.label);
    add(d.command);
  }
  for (const v of table.verbs) {
    add(v.label.replace(/…$/, ''));
    add(v.command);
  }
  ['L', 'I', 'X', 'Z', 'G', 'INV', 'GET', 'UP', 'DOWN', 'IN', 'OUT'].forEach(add);
  return out;
}

/** Character ranges of heading runs in a paragraph (the title of a game, a chapter). */
function headingRanges(source: NamedSource): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!source.runs) return ranges;
  let offset = 0;
  for (const run of source.runs) {
    if (HEADINGS.test(run.style)) ranges.push([offset, offset + run.text.length]);
    offset += run.text.length;
  }
  return ranges;
}

/** A paragraph whose letters are all capitals: a title, a heading, or a list of example commands. */
function allCapitals(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

/**
 * The commands named in capitals in `paragraphs` (the text since the last command, in order), as chips for the verbs
 * row: first those the text announces ("type HELP", a quoted or starred command, "the GUIDE command"), then the usual
 * meta commands named on their own (HELP, HINTS, CREDITS…), in order of appearance, at most MAX_NAMED. `exclude` are
 * texts that are not commands (the room name, the status rows).
 */
export function namedCommands(
  paragraphs: NamedSource[],
  table: VerbTable,
  exclude: string[] = [],
): Chip<string>[] {
  const bar = barCommands(table);
  const excluded: Record<string, boolean> = {};
  for (const text of exclude) excluded[text.trim().toUpperCase()] = true;
  const found: Record<string, Found> = {};
  let order = 0;
  for (const source of paragraphs) {
    const text = source.text;
    if (allCapitals(text)) continue;
    const headings = headingRanges(source);
    // The previous run in this paragraph had a cue, and where it ended: "type HELP or ABOUT".
    let cued = false;
    let lastEnd = 0;
    RUN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RUN.exec(text))) {
      const label = match[2].replace(/\s+/g, ' ');
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const listed: boolean =
        cued && !SENTENCE_END.test(text.slice(lastEnd, start)) && OR.test(before);
      const announced: boolean = CUE.test(before) || listed;
      const marked = OPEN.test(before) && CLOSE.test(after);
      const named = COMMAND_AFTER.test(after);
      cued = announced;
      lastEnd = end;
      const words = label.split(' ');
      const key = label.toUpperCase();
      if (
        excluded[key] ||
        bar[key] ||
        RESERVED.test(words[0]) ||
        words.some((w) => ROMAN.test(w)) ||
        headings.some((r) => start < r[1] && end > r[0])
      ) {
        continue;
      }
      const needsObject = PLACEHOLDER.test(after);
      // A placeholder after it ("TALK TO someone") shows a command too.
      const strong = announced || marked || named || needsObject;
      if (!strong && !(words.length === 1 && META.test(key))) continue;
      if (found[key]) {
        if (strong) found[key].strong = true;
        continue;
      }
      found[key] = {
        label: label,
        strong: strong,
        needsObject: needsObject,
        order: order++,
      };
    }
  }
  const list = Object.keys(found).map((key) => found[key]);
  list.sort((a, b) => (a.strong === b.strong ? a.order - b.order : a.strong ? -1 : 1));
  return list.slice(0, MAX_NAMED).map((f) => ({
    id: 'named:' + f.label.toLowerCase(),
    label: f.needsObject ? f.label + '…' : f.label,
    command: f.label.toLowerCase(),
    needsObject: f.needsObject,
  }));
}
