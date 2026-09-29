// Noun chips (SPEC §3.6): objects recently mentioned by the game, guessed from its prose. A heuristic, not a parser:
// a noun phrase starts after an article ("a paraffin can", "une lampe ancienne") and ends at punctuation or a stop
// word; its head noun (last word in English, first in French…) becomes the chip.
import type { VerbTable } from './verbs';

/** At most this many noun chips, most recently mentioned first. */
export const MAX_NOUNS = 8;

// Letters (including accented Latin ones) and inner apostrophes / hyphens.
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*/g;

interface Token {
  word: string;
  /** Punctuation between this token and the previous one ends a phrase. */
  breakBefore: boolean;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  WORD.lastIndex = 0;
  while ((match = WORD.exec(text))) {
    const between = text.slice(last, match.index);
    tokens.push({ word: match[0], breakBefore: /[.,;:!?()"“”«»—]/.test(between) });
    last = match.index + match[0].length;
  }
  return tokens;
}

/** Splits an elided article glued to its noun: "l'ancre" → ["l'", "ancre"]. */
function splitElision(word: string, articles: string[]): string[] {
  const match = /^([A-Za-z][’'])(.+)$/.exec(word);
  if (match && articles.indexOf(match[1].toLowerCase()) >= 0) return [match[1], match[2]];
  return [word];
}

function endsWithAny(word: string, endings: string[]): boolean {
  for (let i = 0; i < endings.length; i++) {
    const end = endings[i];
    if (word.length > end.length + 2 && word.slice(-end.length) === end) return true;
  }
  return false;
}

function isArticle(word: string, table: VerbTable): boolean {
  return table.articles.indexOf(word.toLowerCase()) >= 0;
}

/** Head nouns of the noun phrases in one paragraph, in reading order. */
export function nounsIn(text: string, table: VerbTable, exclude: string[] = []): string[] {
  const tokens: Token[] = [];
  const raw = tokenize(text);
  for (let i = 0; i < raw.length; i++) {
    const parts = splitElision(raw[i].word, table.articles);
    for (let j = 0; j < parts.length; j++) {
      tokens.push({ word: parts[j], breakBefore: j === 0 && raw[i].breakBefore });
    }
  }

  const found: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isArticle(tokens[i].word, table)) continue;
    // Collect the phrase after the article.
    const phrase: string[] = [];
    let j = i + 1;
    while (j < tokens.length && !tokens[j].breakBefore && phrase.length < 5) {
      const word = tokens[j].word.toLowerCase();
      if (table.stopWords.indexOf(word) >= 0 || isArticle(word, table)) break;
      if (phrase.length && endsWithAny(word, table.verbEndings)) break;
      phrase.push(word);
      j++;
    }
    // "box of matches" → "box": the head sits before "of" in every language.
    let end = phrase.length;
    for (let k = 0; k < phrase.length; k++) {
      if (table.of.indexOf(phrase[k]) >= 0) {
        end = k;
        break;
      }
    }
    const words = phrase.slice(0, end);
    if (!words.length) continue;
    const head = table.head === 'first' ? words[0] : words[words.length - 1];
    if (head.length < 3 || exclude.indexOf(head) >= 0) continue;
    found.push(head);
  }
  return found;
}

/**
 * Noun chips from the most recent paragraphs (newest first, deduplicated), skipping words that are directions or
 * verbs of the table, and the room name shown in the status line.
 */
export function recentNouns(
  paragraphs: string[],
  table: VerbTable,
  status = '',
  max = MAX_NOUNS,
): string[] {
  const exclude: string[] = [];
  for (let i = 0; i < table.directions.length; i++) exclude.push(table.directions[i].command);
  for (let i = 0; i < table.verbs.length; i++) exclude.push(table.verbs[i].command);
  const room = status.toLowerCase().match(WORD) || [];
  for (let i = 0; i < room.length; i++) exclude.push(room[i]);

  const nouns: string[] = [];
  for (let p = paragraphs.length - 1; p >= 0 && nouns.length < max; p--) {
    const inParagraph = nounsIn(paragraphs[p], table, exclude);
    for (let n = 0; n < inParagraph.length && nouns.length < max; n++) {
      if (nouns.indexOf(inParagraph[n]) < 0) nouns.push(inParagraph[n]);
    }
  }
  return nouns;
}
