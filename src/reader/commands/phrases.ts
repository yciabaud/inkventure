// What games say, per language (SPEC §3.6): the words the chip heuristics look for in the game's text — yes/no
// questions (S1.17), commands named in capitals (S1.19), the parser's questions for an object (S1.21). The heuristics
// themselves (answers.ts, capitals.ts, question.ts) hold no language: adding a language means filling a table here.
// EN and FR are checked against the Inform libraries and the featured games; ES, DE and IT are stubs to verify with
// real games (they also rely on the signals that need no words, see question.ts).
//
// The detectors read the game's table with the English words added (`phrases`): many games in other languages keep
// English meta commands or library messages. Only the words a game prints as they are: never English grammar (the
// auxiliaries of a yes/no question would read the German "Was willst du…?" as "Was … you"), Yes / No, nor articles.

import type { GameLanguage } from './verbs';

export interface PhraseTable {
  language: GameLanguage;
  /** False for tables not yet checked against real games in that language. */
  verified: boolean;

  // Lists ("the X, the Y or the Z").
  /** The word before the last item of a list of alternatives. */
  or: string[];
  /** The word before the last item of a list. */
  and: string[];
  /** Articles and possessives before an object in the parser's lists ("the lamp", "your coat", "l'ancre"). */
  determiners: string[];

  // Yes/no questions to the player (S1.17).
  /** Yes and No: [label, command]. */
  yesNo: [[string, string], [string, string]];
  /** The game says what it expects: "yes or no". */
  yesNoPhrases: string[];
  /** The keys of "(y/n)", as written between the brackets. */
  yesNoKeys: string[];
  /** A question starting with one of these verbs, with a pronoun of `pronouns` in it, asks the player ("Would you…?"). */
  auxiliaries: string[];
  pronouns: string[];
  /** A question starting with a verb joined to one of these pronouns asks the player ("Voulez-vous…?"). */
  inverted: string[];
  /** A question starting with one of these, with a pronoun of `pronouns` after it, asks the player ("Est-ce que vous…?"). */
  questionStarts: string[];

  // Commands named in capitals (S1.19).
  /** Words that announce a command just before it: "type HELP", "tapez AIDE". */
  cues: string[];
  /** "the GUIDE command": the word after a command that names it as one. */
  commandWords: string[];
  /** After a command, a placeholder for an object or a person: "TALK TO someone". */
  placeholders: string[];
  /** Usual meta commands, worth a chip when named on their own (upper case). */
  meta: string[];
  /** What the reader's menu already does, or what would stop or reset the game: never a chip (upper case). */
  reserved: string[];
  /** Abbreviations the bar's chips already cover (upper case). */
  abbreviations: string[];

  // The parser's questions for an object (S1.21); the forms of the Inform libraries, sources in question.ts.
  /** Before a list of objects to choose from: "Which do you mean, the X or the Y?". */
  whichStarts: string[];
  /** A question for an object that names none: "What do you want to examine?". */
  whatStarts: string[];
  /** Before `whatStarts`: the preposition the player typed ("À qui voulez-vous parler ?"). */
  prepositions: string[];
  /** The end of a question for one object among several: "Which exactly?". */
  whatEnds: string[];
  /** A question that says neither the action nor the object: "Pouvez-vous préciser ?". */
  vagueStarts: string[];
}

const EN: PhraseTable = {
  language: 'en',
  verified: true,
  or: ['or'],
  and: ['and'],
  determiners: ['the', 'a', 'an', 'some', 'your', 'my', 'his', 'her', 'its', 'their'],
  yesNo: [
    ['Yes', 'yes'],
    ['No', 'no'],
  ],
  yesNoPhrases: ['yes or no', 'yes/no'],
  yesNoKeys: ['y/n'],
  auxiliaries: [
    'do',
    'does',
    'did',
    'would',
    'will',
    'can',
    'could',
    'shall',
    'should',
    'are',
    'is',
    'was',
    'were',
    'have',
    'has',
    'had',
    'may',
    'might',
    'must',
    'want',
  ],
  pronouns: ['you', 'your', 'i', 'we'],
  inverted: [],
  questionStarts: [],
  cues: ['type', 'typing', 'typed', 'try', 'trying', 'enter', 'say', 'use', 'using', 'command'],
  commandWords: ['command'],
  placeholders: [
    'someone',
    'somebody',
    'something',
    'anyone',
    'anything',
    'object',
    'person',
    'thing',
  ],
  meta: [
    'HELP',
    'HINT',
    'HINTS',
    'ABOUT',
    'CREDITS',
    'COPYRIGHT',
    'INFO',
    'INTRO',
    'INSTRUCTIONS',
    'VERBS',
    'MENU',
    'GUIDE',
    'AMUSING',
  ],
  reserved: ['SAVE', 'RESTORE', 'RESTART', 'QUIT', 'Q', 'UNDO', 'SCRIPT', 'UNSCRIPT', 'TRANSCRIPT'],
  abbreviations: ['L', 'I', 'X', 'Z', 'G', 'INV', 'GET', 'UP', 'DOWN', 'IN', 'OUT'],
  // Inform 6 english.h Miscellany 45–49; Inform 7 parser clarification internal rule (A)–(E).
  whichStarts: ['which do you mean', 'who do you mean'],
  whatStarts: ['what do you want', 'whom do you want', 'who do you want'],
  prepositions: [],
  whatEnds: ['which exactly'],
  vagueStarts: [],
};

const FR: PhraseTable = {
  language: 'fr',
  verified: true,
  or: ['ou'],
  and: ['et'],
  determiners: [
    'le',
    'la',
    'les',
    "l'",
    'l’',
    'un',
    'une',
    'des',
    'du',
    'de la',
    "de l'",
    'de l’',
    'votre',
    'vos',
    'ton',
    'ta',
    'tes',
    'mon',
    'ma',
    'mes',
    'son',
    'sa',
    'ses',
    'leur',
    'leurs',
  ],
  yesNo: [
    ['Oui', 'oui'],
    ['Non', 'non'],
  ],
  yesNoPhrases: ['oui ou non', 'oui/non'],
  yesNoKeys: ['o/n'],
  auxiliaries: [],
  pronouns: ['vous', 'tu', 'je', 'nous'],
  inverted: ['vous', 'tu', 'je', 'nous'],
  questionStarts: ['est-ce que', "est-ce qu'", 'est-ce qu’'],
  cues: ['tapez', 'taper', 'tape', 'essayez', 'essaie', 'entrez', 'dites', 'commande', 'utilisez'],
  commandWords: ['commande'],
  placeholders: ["quelqu'un", 'quelqu’un', 'quelque chose', 'objet', 'personne'],
  meta: ['AIDE', 'INDICE', 'INDICES', 'CRÉDITS', 'CREDITS', 'APROPOS'],
  reserved: ['SAUVER', 'SAUVEGARDER', 'CHARGER', 'RECOMMENCER', 'QUITTER', 'ANNULER'],
  abbreviations: [],
  // French.h (Jean-Luc Pontico) and frenchU.h (Lionel Ange), Miscellany 45–49; French Language for Inform 7
  // (Nathanael Marion), parser clarification internal rule.
  whichStarts: ['précisez', 'voulez-vous dire'],
  whatStarts: [
    'que voulez-vous',
    'qui voulez-vous',
    'quoi voulez-vous',
    'que veux-tu',
    'qui veux-tu',
    'quoi veux-tu',
  ],
  prepositions: [
    'à',
    'a',
    'au',
    'aux',
    'sur',
    'dans',
    'avec',
    'de',
    'du',
    'en',
    'contre',
    'sous',
    'vers',
    'par',
    'pour',
    'chez',
    'derrière',
    'devant',
    'entre',
  ],
  whatEnds: ['lequel exactement', 'lequel voulez-vous exactement'],
  vagueStarts: ['pouvez-vous préciser'],
};

const ES: PhraseTable = {
  language: 'es',
  verified: false,
  or: ['o', 'u'],
  and: ['y', 'e'],
  determiners: [
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'unos',
    'unas',
    'tu',
    'tus',
    'mi',
    'mis',
    'su',
    'sus',
  ],
  yesNo: [
    ['Sí', 'si'],
    ['No', 'no'],
  ],
  yesNoPhrases: ['sí o no', 'si o no'],
  yesNoKeys: ['s/n'],
  auxiliaries: [],
  pronouns: [],
  inverted: [],
  questionStarts: [],
  cues: ['escribe', 'teclea', 'prueba', 'usa', 'comando', 'orden'],
  commandWords: ['comando', 'orden'],
  placeholders: ['alguien', 'algo', 'objeto'],
  meta: ['AYUDA', 'PISTA', 'PISTAS', 'CREDITOS', 'CRÉDITOS', 'INFO'],
  reserved: ['GUARDAR', 'CARGAR', 'RECUPERAR', 'REINICIAR', 'TERMINAR', 'FIN', 'DESHACER'],
  abbreviations: [],
  whichStarts: [],
  whatStarts: [],
  prepositions: [],
  whatEnds: [],
  vagueStarts: [],
};

const DE: PhraseTable = {
  language: 'de',
  verified: false,
  or: ['oder'],
  and: ['und'],
  determiners: [
    'der',
    'die',
    'das',
    'den',
    'dem',
    'des',
    'ein',
    'eine',
    'einen',
    'einem',
    'einer',
    'dein',
    'deine',
    'deinen',
    'mein',
    'meine',
    'meinen',
  ],
  yesNo: [
    ['Ja', 'ja'],
    ['Nein', 'nein'],
  ],
  yesNoPhrases: ['ja oder nein'],
  yesNoKeys: ['j/n'],
  auxiliaries: [
    'willst',
    'möchtest',
    'bist',
    'hast',
    'kannst',
    'würdest',
    'wollen',
    'möchten',
    'sind',
    'haben',
    'können',
    'würden',
  ],
  pronouns: ['du', 'sie', 'ich', 'wir'],
  inverted: [],
  questionStarts: [],
  cues: ['tippe', 'tippen', 'gib', 'eingeben', 'versuche', 'befehl'],
  commandWords: ['befehl'],
  placeholders: ['jemanden', 'jemand', 'etwas', 'gegenstand'],
  meta: ['HILFE', 'TIPP', 'TIPPS', 'INFO'],
  reserved: ['SPEICHERN', 'LADEN', 'NEUSTART', 'ENDE', 'BEENDEN'],
  abbreviations: [],
  whichStarts: [],
  whatStarts: [],
  prepositions: [],
  whatEnds: [],
  vagueStarts: [],
};

const IT: PhraseTable = {
  language: 'it',
  verified: false,
  or: ['o', 'oppure'],
  and: ['e', 'ed'],
  determiners: [
    'il',
    'lo',
    'la',
    'i',
    'gli',
    'le',
    "l'",
    'l’',
    'un',
    'uno',
    'una',
    "un'",
    'tuo',
    'tua',
    'mio',
    'mia',
  ],
  yesNo: [
    ['Sì', 'si'],
    ['No', 'no'],
  ],
  yesNoPhrases: ['sì o no', 'si o no'],
  yesNoKeys: ['s/n'],
  auxiliaries: [],
  pronouns: [],
  inverted: [],
  questionStarts: [],
  cues: ['scrivi', 'digita', 'prova', 'usa', 'comando'],
  commandWords: ['comando'],
  placeholders: ['qualcuno', 'qualcosa', 'oggetto'],
  meta: ['AIUTO', 'SUGGERIMENTO', 'CREDITI', 'INFO'],
  reserved: ['SALVA', 'CARICA', 'RICOMINCIA', 'FINE', 'ESCI', 'ANNULLA'],
  abbreviations: [],
  whichStarts: [],
  whatStarts: [],
  prepositions: [],
  whatEnds: [],
  vagueStarts: [],
};

const TABLES: Record<GameLanguage, PhraseTable> = { en: EN, fr: FR, es: ES, de: DE, it: IT };

/** Every language's own table, for the key parity test and the docs. */
export const PHRASE_TABLES: PhraseTable[] = [EN, FR, ES, DE, IT];

const merged: Partial<Record<GameLanguage, PhraseTable>> = {};

/** The lists that stay the game language's own: its grammar, and its Yes / No. */
const OWN: Array<keyof PhraseTable> = [
  'yesNo',
  'auxiliaries',
  'pronouns',
  'inverted',
  'questionStarts',
  'determiners',
  'prepositions',
];

/** The phrases of a game language, with the English words a game may print as they are added to its lists. */
export function phrases(language: GameLanguage): PhraseTable {
  const own = TABLES[language] || EN;
  if (own === EN) return EN;
  const cached = merged[own.language];
  if (cached) return cached;
  const table = { ...own } as PhraseTable;
  const lists = table as unknown as Record<string, unknown>;
  const english = EN as unknown as Record<string, unknown>;
  for (const key of Object.keys(lists)) {
    const value = lists[key];
    if (Array.isArray(value) && OWN.indexOf(key as keyof PhraseTable) < 0) {
      lists[key] = value.concat((english[key] as string[]).filter((w) => value.indexOf(w) < 0));
    }
  }
  merged[own.language] = table;
  return table;
}

// Letters, including accented Latin ones: word boundaries that `\b` (ASCII only) gets wrong.
export const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';

/** A regular expression alternation of `words` (longest first, spaces matching any run of spaces). */
export function alternation(words: string[]): string {
  return words
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ +/g, '\\s+'))
    .join('|');
}

/** Matches one of `words` as a whole word; never matches when the list is empty. */
export function wordPattern(words: string[], before = '', after = '', flags = 'i'): RegExp {
  if (!words.length) return /(?!)/;
  return new RegExp(
    before + '(?:^|[^' + LETTER + '])(?:' + alternation(words) + ')(?![' + LETTER + '])' + after,
    flags,
  );
}

/** Matches `text` starting with one of `words` as a whole word; never matches when the list is empty. */
export function startPattern(words: string[], after = '', flags = 'i'): RegExp {
  if (!words.length) return /(?!)/;
  return new RegExp('^(?:' + alternation(words) + ')(?![' + LETTER + '])' + after, flags);
}

/** Compiles the regular expressions of a table once. */
export function compiled<T>(
  cache: Partial<Record<GameLanguage, T>>,
  table: PhraseTable,
  build: (t: PhraseTable) => T,
): T {
  const hit = cache[table.language];
  if (hit) return hit;
  const value = build(table);
  cache[table.language] = value;
  return value;
}
