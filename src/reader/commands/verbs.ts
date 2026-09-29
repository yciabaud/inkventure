// Tap-to-play vocabulary (SPEC §3.6): compass and verb chips in the language of the *game*, not of the UI, since
// they produce commands the game's parser must understand. EN and FR are checked against the Inform 6 standard /
// French libraries; ES, DE and IT are stubs to verify with real games.

export type GameLanguage = 'en' | 'fr' | 'es' | 'de' | 'it';

export const GAME_LANGUAGES: GameLanguage[] = ['en', 'fr', 'es', 'de', 'it'];

export type DirectionId =
  'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'up' | 'down' | 'in' | 'out';

export type VerbId =
  'look' | 'inventory' | 'examine' | 'take' | 'drop' | 'open' | 'talk' | 'wait' | 'again' | 'undo';

export interface Chip<Id extends string> {
  id: Id;
  /** Shown on the chip. */
  label: string;
  /** Sent to the game (or, with `needsObject`, put in the command field before a noun). */
  command: string;
  /** "Examine…": the command is completed by a noun instead of being sent. */
  needsObject: boolean;
}

export interface VerbTable {
  language: GameLanguage;
  /** False for tables not yet checked against a real game in that language. */
  verified: boolean;
  directions: Chip<DirectionId>[];
  verbs: Chip<VerbId>[];
  /** Articles that introduce a noun phrase in game output, for noun extraction. */
  articles: string[];
  /** Words that end a noun phrase (verbs, prepositions, adverbs…). */
  stopWords: string[];
  /** Linking word inside a noun phrase ("box of matches"): the head noun comes before it. */
  of: string[];
  /** Where the head noun sits in a noun phrase: last (EN, DE: adjectives first) or first (FR, ES, IT). */
  head: 'first' | 'last';
  /** Endings of verb forms that end a noun phrase after its first word ("a rope looped round…"). */
  verbEndings: string[];
}

type Row = [label: string, command: string];

function chips<Id extends string>(ids: Id[], rows: Row[], needsObject: Id[] = []): Chip<Id>[] {
  return ids.map((id, i) => ({
    id: id,
    label: rows[i][0],
    command: rows[i][1],
    needsObject: needsObject.indexOf(id) >= 0,
  }));
}

const DIRECTIONS: DirectionId[] = [
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
  'up',
  'down',
  'in',
  'out',
];
const VERBS: VerbId[] = [
  'look',
  'inventory',
  'examine',
  'take',
  'drop',
  'open',
  'talk',
  'wait',
  'again',
  'undo',
];
const OBJECT_VERBS: VerbId[] = ['examine', 'take', 'drop', 'open', 'talk'];

const TABLES: Record<GameLanguage, VerbTable> = {
  en: {
    language: 'en',
    verified: true,
    directions: chips(DIRECTIONS, [
      ['N', 'north'],
      ['S', 'south'],
      ['E', 'east'],
      ['W', 'west'],
      ['NE', 'northeast'],
      ['NW', 'northwest'],
      ['SE', 'southeast'],
      ['SW', 'southwest'],
      ['Up', 'up'],
      ['Down', 'down'],
      ['In', 'in'],
      ['Out', 'out'],
    ]),
    verbs: chips(
      VERBS,
      [
        ['Look', 'look'],
        ['Inventory', 'inventory'],
        ['Examine…', 'examine'],
        ['Take…', 'take'],
        ['Drop…', 'drop'],
        ['Open…', 'open'],
        ['Talk to…', 'talk to'],
        ['Wait', 'wait'],
        ['Again', 'again'],
        ['Undo', 'undo'],
      ],
      OBJECT_VERBS,
    ),
    articles: ['a', 'an', 'the', 'some', 'your'],
    stopWords: [
      'is',
      'are',
      'was',
      'were',
      'be',
      'here',
      'there',
      'and',
      'or',
      'but',
      'with',
      'on',
      'in',
      'into',
      'onto',
      'to',
      'from',
      'by',
      'at',
      'for',
      'under',
      'behind',
      'which',
      'that',
      'this',
      'it',
      'its',
      'you',
      'nearby',
      'lie',
      'lies',
      'stand',
      'stands',
      'hang',
      'hangs',
      'sit',
      'sits',
      'rest',
      'rests',
      'lead',
      'leads',
      'look',
      'looks',
      'seem',
      'seems',
      'lean',
      'leans',
      'rise',
      'rises',
      'run',
      'runs',
      'stretch',
      'stretches',
      'glow',
      'glows',
      'block',
      'blocks',
      'cover',
      'covers',
      'fill',
      'fills',
      'wait',
      'waits',
      'has',
      'have',
      'had',
      'will',
      'round',
      'around',
      'across',
      'through',
      'over',
      'near',
      'beside',
      'against',
      'along',
      'about',
      'up',
      'down',
      'out',
      'off',
    ],
    of: ['of'],
    head: 'last',
    verbEndings: ['ed', 'ing'],
  },
  fr: {
    language: 'fr',
    verified: true,
    directions: chips(DIRECTIONS, [
      ['N', 'nord'],
      ['S', 'sud'],
      ['E', 'est'],
      ['O', 'ouest'],
      ['NE', 'nord-est'],
      ['NO', 'nord-ouest'],
      ['SE', 'sud-est'],
      ['SO', 'sud-ouest'],
      ['Haut', 'monter'],
      ['Bas', 'descendre'],
      ['Entrer', 'entrer'],
      ['Sortir', 'sortir'],
    ]),
    verbs: chips(
      VERBS,
      [
        ['Regarder', 'regarder'],
        ['Inventaire', 'inventaire'],
        ['Examiner…', 'examiner'],
        ['Prendre…', 'prendre'],
        ['Poser…', 'poser'],
        ['Ouvrir…', 'ouvrir'],
        ['Parler à…', 'parler à'],
        ['Attendre', 'attendre'],
        ['Encore', 'encore'],
        ['Annuler', 'annuler'],
      ],
      OBJECT_VERBS,
    ),
    articles: ['un', 'une', 'le', 'la', 'les', "l'", 'l’', 'des', 'du', 'votre', 'vos'],
    stopWords: [
      'est',
      'sont',
      'était',
      'ici',
      'là',
      'et',
      'ou',
      'mais',
      'avec',
      'sur',
      'dans',
      'à',
      'au',
      'aux',
      'par',
      'pour',
      'sous',
      'derrière',
      'qui',
      'que',
      'vous',
      'se',
      'il',
      'elle',
      'y',
      'mène',
      'semble',
      'a',
      'peut',
    ],
    of: ['de', 'du', "d'", 'd’'],
    head: 'first',
    verbEndings: [],
  },
  es: {
    language: 'es',
    verified: false,
    directions: chips(DIRECTIONS, [
      ['N', 'norte'],
      ['S', 'sur'],
      ['E', 'este'],
      ['O', 'oeste'],
      ['NE', 'noreste'],
      ['NO', 'noroeste'],
      ['SE', 'sureste'],
      ['SO', 'suroeste'],
      ['Arriba', 'arriba'],
      ['Abajo', 'abajo'],
      ['Entrar', 'entrar'],
      ['Salir', 'salir'],
    ]),
    verbs: chips(
      VERBS,
      [
        ['Mirar', 'mirar'],
        ['Inventario', 'inventario'],
        ['Examinar…', 'examinar'],
        ['Coger…', 'coger'],
        ['Dejar…', 'dejar'],
        ['Abrir…', 'abrir'],
        ['Hablar con…', 'hablar con'],
        ['Esperar', 'esperar'],
        ['Otra vez', 'repetir'],
        ['Deshacer', 'deshacer'],
      ],
      OBJECT_VERBS,
    ),
    articles: ['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'tu'],
    stopWords: [
      'es',
      'está',
      'están',
      'hay',
      'aquí',
      'allí',
      'y',
      'o',
      'con',
      'en',
      'sobre',
      'a',
      'al',
      'que',
    ],
    of: ['de', 'del'],
    head: 'first',
    verbEndings: [],
  },
  de: {
    language: 'de',
    verified: false,
    directions: chips(DIRECTIONS, [
      ['N', 'norden'],
      ['S', 'süden'],
      ['O', 'osten'],
      ['W', 'westen'],
      ['NO', 'nordosten'],
      ['NW', 'nordwesten'],
      ['SO', 'südosten'],
      ['SW', 'südwesten'],
      ['Hoch', 'hoch'],
      ['Runter', 'runter'],
      ['Rein', 'rein'],
      ['Raus', 'raus'],
    ]),
    verbs: chips(
      VERBS,
      [
        ['Schau', 'schau'],
        ['Inventar', 'inventar'],
        ['Untersuche…', 'untersuche'],
        ['Nimm…', 'nimm'],
        ['Lege ab…', 'lege'],
        ['Öffne…', 'öffne'],
        ['Sprich mit…', 'sprich mit'],
        ['Warte', 'warte'],
        ['Nochmal', 'nochmal'],
        ['Zurück', 'undo'],
      ],
      OBJECT_VERBS,
    ),
    articles: ['ein', 'eine', 'einen', 'einem', 'einer', 'der', 'die', 'das', 'den', 'dem'],
    stopWords: [
      'ist',
      'sind',
      'hier',
      'dort',
      'und',
      'oder',
      'mit',
      'auf',
      'in',
      'im',
      'an',
      'am',
      'zu',
      'von',
    ],
    of: [],
    head: 'last',
    verbEndings: [],
  },
  it: {
    language: 'it',
    verified: false,
    directions: chips(DIRECTIONS, [
      ['N', 'nord'],
      ['S', 'sud'],
      ['E', 'est'],
      ['O', 'ovest'],
      ['NE', 'nordest'],
      ['NO', 'nordovest'],
      ['SE', 'sudest'],
      ['SO', 'sudovest'],
      ['Su', 'su'],
      ['Giù', 'giù'],
      ['Entra', 'entra'],
      ['Esci', 'esci'],
    ]),
    verbs: chips(
      VERBS,
      [
        ['Guarda', 'guarda'],
        ['Inventario', 'inventario'],
        ['Esamina…', 'esamina'],
        ['Prendi…', 'prendi'],
        ['Lascia…', 'lascia'],
        ['Apri…', 'apri'],
        ['Parla con…', 'parla con'],
        ['Aspetta', 'aspetta'],
        ['Ancora', 'ancora'],
        ['Annulla', 'annulla'],
      ],
      OBJECT_VERBS,
    ),
    articles: ['un', 'uno', 'una', "un'", 'il', 'lo', 'la', 'i', 'gli', 'le', "l'"],
    stopWords: [
      'è',
      'sono',
      'qui',
      'lì',
      'e',
      'o',
      'con',
      'su',
      'in',
      'nel',
      'nella',
      'a',
      'al',
      'che',
    ],
    of: ['di', 'del', 'della'],
    head: 'first',
    verbEndings: [],
  },
};

/** Maps a language tag (`fr-FR`, `French`…) to a verb table; unknown languages get English. */
export function verbTable(language: string | null | undefined): VerbTable {
  const tag = (language || '').toLowerCase();
  const names: Record<string, GameLanguage> = {
    english: 'en',
    french: 'fr',
    français: 'fr',
    spanish: 'es',
    español: 'es',
    german: 'de',
    deutsch: 'de',
    italian: 'it',
    italiano: 'it',
  };
  const base = tag.split(/[-_]/)[0];
  const code = (GAME_LANGUAGES.indexOf(base as GameLanguage) >= 0 ? base : names[tag]) as
    GameLanguage | undefined;
  return TABLES[code || 'en'];
}
