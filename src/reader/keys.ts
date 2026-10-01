// Key chips (SPEC §3.6): when the game waits for a single key, the keys its text names ("Press N to begin", "Choose
// option 1 or 2", a menu legend "N = Next  Q = Quit Menu"). A heuristic over the prose and the status rows, so that an
// e-reader with no keyboard can send them.

/** At most this many key chips; other keys can still be typed in the one-key field. */
export const MAX_KEYS = 8;

export interface KeyChip {
  /** The key as shown: an upper-case letter, a digit, or a Glk key name (`return`, `escape`). */
  key: string;
  /** What is sent to the game: a lower-case letter, a digit, or the Glk key name. */
  send: string;
  /** What the key does, when the text says ("Next", "restore"). */
  label?: string;
}

export interface KeyPrompt {
  keys: KeyChip[];
  /** The game asks for the space bar: "Continue" sends a space instead of Return. */
  space: boolean;
}

// Named keys, upper case, to Glk key names (a space is the character itself).
const NAMED: Record<string, string> = {
  SPACE: ' ',
  SPACEBAR: ' ',
  ESPACE: ' ',
  RETURN: 'return',
  ENTER: 'return',
  ENTRÉE: 'return',
  ENTREE: 'return',
  ESC: 'escape',
  ESCAPE: 'escape',
  ÉCHAP: 'escape',
  ECHAP: 'escape',
};
const NAMED_KEYS = 'SPACE ?BAR|SPACEBAR|ESPACE|RETURN|ENTER|ENTR[ÉE]E|ESCAPE|ESC|[ÉE]CHAP';

// A key in quotes or brackets, any case: 'R', "N", [Q], ‘SPACE’.
const QUOTED = '[\'"‘’“”\\[]([A-Za-z0-9]|' + NAMED_KEYS + ')[\'"‘’“”\\]]';
// A bare key that cannot be read as a word: an upper-case letter or a digit, or a named key in capitals.
const BARE = '([A-Z0-9]|' + NAMED_KEYS + ")(?![A-Za-zÀ-ÿ0-9'’])";

// "press N", "press 'r'", "appuyez sur [Q]", optionally followed by "to <action>".
const PRESS = new RegExp(
  '(?:^|[^A-Za-zÀ-ÿ])(?:press|hit|type|tap|push|appuyez sur|appuie sur|pressez|presse|tapez|tape)\\s+' +
    '(?:the\\s+|la\\s+|le\\s+|sur\\s+)?' +
    '(?:' +
    QUOTED +
    "|([A-Za-z0-9])(?![A-Za-zÀ-ÿ0-9'’])|(" +
    NAMED_KEYS +
    ')(?![A-Za-z]))' +
    '(?:\\s+(?:key|touche))?' +
    '(?:\\s+(?:to|pour)\\s+([A-Za-zÀ-ÿ][^.,;:!?()[\\]]*))?',
  'gi',
);
// "R to restore", "or C to show the Table of Contents", "N pour commencer".
const TO = new RegExp(
  '(?:^|[\\s,;(])(?:' + QUOTED + '|' + BARE + ')\\s+(?:to|pour)\\s+([A-Za-zÀ-ÿ][^.,;:!?()[\\]=]*)',
  'g',
);
// Menu legends: "N = Next", "Q = Quit Menu", "ENTER = Select", "[R] = read".
const LEGEND = new RegExp('(?:^|[\\s,;(])(?:' + QUOTED + '|' + BARE + ')\\s*=\\s*', 'g');
// Alternatives: "1 or 2", "1, 2 or 3", "Y/N", "(y/n)", "A ou B".
const ONE = '[\'"‘“]?([A-Za-z0-9])[\'"’”]?';
const ALTERNATIVES = new RegExp(
  '(?:^|[\\s(\\[])(' +
    ONE +
    '(?:\\s*(?:,|/)\\s*' +
    ONE +
    ')*\\s*(?:/|\\s+or\\s+|\\s+ou\\s+)' +
    ONE +
    ')(?=$|[\\s).,;:!?\\]])',
  'g',
);
const YES_NO = /\b(yes or no|oui ou non)\b/gi;
// A numbered option at the start of a line: "1. Story mode", "(2) Autonomous", "3) Quit".
const NUMBERED = /(?:^|\n)\s*(?:\((\d)\)|(\d)[.)])\s+(\S[^\n]*)/g;
// The game asks for the space bar.
const SPACE =
  /(space ?bar|space key|barre d['’]espace|touche espace|(press|hit|appuyez sur)\s+(the\s+)?['"‘“[]?space\b)/i;
// Words that do not end a short label.
const TRAILING =
  /\s+(the|a|an|to|of|from|for|your|and|or|with|la|le|les|un|une|de|du|des|pour|et|ou|au)$/i;
const LABEL_MAX = 18;

interface Hit {
  source: number;
  index: number;
  chip: KeyChip;
}

/** The key to show and to send for a key token as found in the text, or null for the space bar. */
function keyOf(token: string): { key: string; send: string } | null {
  const upper = token.toUpperCase().replace(/\s+/g, '');
  const named = NAMED[upper];
  if (named !== undefined) return named === ' ' ? null : { key: named, send: named };
  return { key: upper, send: token.toLowerCase() };
}

/**
 * A few words of `phrase`, up to its first punctuation mark, at most LABEL_MAX characters, not ending on an article or
 * a preposition.
 */
export function shortLabel(phrase: string): string {
  const words = phrase
    .split(/[:;,.!?()[\]{}<>«»“”"—–]|\s-\s/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  let label = '';
  for (let i = 0; i < words.length; i++) {
    const next = label ? label + ' ' + words[i] : words[i];
    if (label && next.length > LABEL_MAX) break;
    label = next;
  }
  for (;;) {
    const shorter = label.replace(TRAILING, '');
    if (shorter === label) return label;
    label = shorter;
  }
}

function scan(text: string, source: number, hits: Hit[]) {
  function add(index: number, token: string, label?: string) {
    const key = keyOf(token);
    if (!key) return;
    // Return alone is the Continue button; it gets a chip only for a menu action ("ENTER = Select").
    if (key.send === 'return' && !label) return;
    const chip: KeyChip = { key: key.key, send: key.send };
    const short = label ? shortLabel(label) : '';
    if (short) chip.label = short;
    hits.push({ source: source, index: index, chip: chip });
  }
  let match: RegExpExecArray | null;

  PRESS.lastIndex = 0;
  while ((match = PRESS.exec(text))) {
    const token = match[1] || match[2] || match[3];
    const rest = text.slice(match.index + match[0].length);
    // "press a key", "type a command": an article, not a key.
    if (match[2] && /^a$/i.test(match[2]) && (!match[4] || /\s(key|touche)\b/i.test(match[0])))
      continue;
    if (match[2] && /^\s+[A-Za-zÀ-ÿ]/.test(rest) && !match[4] && !/^\s+(key|touche)\b/i.test(rest))
      continue;
    add(match.index, token, match[4]);
  }

  TO.lastIndex = 0;
  while ((match = TO.exec(text))) {
    const token = match[1] || match[2];
    // "Am I to believe", "A to Z": a word, not a key.
    if (!match[1] && /^[AI]$/.test(token)) continue;
    add(match.index, token, match[3]);
  }

  LEGEND.lastIndex = 0;
  const legends: Array<{ index: number; end: number; token: string }> = [];
  while ((match = LEGEND.exec(text))) {
    legends.push({
      index: match.index,
      end: match.index + match[0].length,
      token: match[1] || match[2],
    });
  }
  for (let i = 0; i < legends.length; i++) {
    const until = i + 1 < legends.length ? legends[i + 1].index : text.length;
    const label = text.slice(legends[i].end, until).split(/\s{2,}|[,;()[\]]/)[0];
    add(legends[i].index, legends[i].token, label);
  }

  ALTERNATIVES.lastIndex = 0;
  while ((match = ALTERNATIVES.exec(text))) {
    const keys = match[1]
      .replace(/\s+(?:or|ou)\s+/g, '/')
      .replace(/[\s'"‘’“”]/g, '')
      .split(/[,/]/);
    const letters = keys.filter((k) => /[A-Za-z]/.test(k));
    // "1 or 2", "Y/N", "Y or N"; not "a or b" nor "I or" in prose.
    const slashed = match[1].indexOf('/') >= 0;
    if (letters.length && !slashed && letters.some((k) => k !== k.toUpperCase() || k === 'I'))
      continue;
    for (let i = 0; i < keys.length; i++) add(match.index + i, keys[i]);
  }

  YES_NO.lastIndex = 0;
  while ((match = YES_NO.exec(text))) {
    const french = /^o/i.test(match[1]);
    add(match.index, french ? 'O' : 'Y');
    add(match.index + 1, 'N');
  }

  NUMBERED.lastIndex = 0;
  while ((match = NUMBERED.exec(text))) add(match.index, match[1] || match[2], match[3]);
}

/**
 * The keys named by `texts` (the paragraphs since the last input, oldest first) and by `status` (every row of the
 * status window), in the order they appear (status rows first, as they are at the top of the screen), without
 * duplicates and at most MAX_KEYS.
 */
export function findKeys(texts: string[], status: string[]): KeyPrompt {
  const sources = status.concat(texts);
  const hits: Hit[] = [];
  let space = false;
  for (let i = 0; i < sources.length; i++) {
    scan(sources[i], i, hits);
    if (SPACE.test(sources[i])) space = true;
  }
  hits.sort((a, b) => a.source - b.source || a.index - b.index);
  const keys: KeyChip[] = [];
  const seen: Record<string, KeyChip> = {};
  for (let i = 0; i < hits.length; i++) {
    const chip = hits[i].chip;
    const known = seen[chip.send];
    if (known) {
      if (!known.label && chip.label) known.label = chip.label;
      continue;
    }
    if (keys.length >= MAX_KEYS) continue;
    seen[chip.send] = chip;
    keys.push(chip);
  }
  return { keys: keys, space: space };
}
