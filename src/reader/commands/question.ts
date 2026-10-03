// Parser questions (SPEC §3.6, story S1.21): when the last paragraph before the prompt is the parser asking for an
// object ("What do you want to examine?", "Which do you mean, the brass lamp or the oil lamp?"), the verbs row shows
// noun chips, and a tap sends the noun alone: the parser completes the command with it.
//
// Two kinds of signals, tried in this order:
// 1. The forms of the Inform libraries, from the game language's phrase table (phrases.ts). Their sources:
//    - Inform 6 English: library 6.12, english.h, Miscellany 45–49.
//    - Inform 7 English: Standard Rules (6M62 and 10.x), responses of the parser clarification internal rule.
//    - Inform 6 French: French.h by Jean-Luc Pontico (library 6/11), Miscellany 45–49; frenchU.h by Lionel Ange
//      (library 6.12), Miscellany 45–49 and PronomInterrogatif in translation.h.
//    - Inform 7 French: French Language by Nathanael Marion (v12 and v13), parser clarification internal rule.
//    Each library prints the options with their definite article, joined by ", " and " or " / " ou " (a serial comma
//    with an option); French puts a space (often no-break) before ":" and "?", or none (Pontico).
// 2. Signals that need no phrase, for the languages and libraries the tables do not know: a short question listing
//    objects that share a word with the command just sent ("examine coat" → "…, the red coat or the blue coat?"),
//    and a short question right after a verb of the bar sent alone ("examine" → "…?"). Since such a question may not
//    say what it is for, the chips then repeat the command ("examine…").
// Either way the whole last paragraph (or its last line) must be the question, so a question in the prose does not
// count.

import { asksYesNo } from './answers';
import { alternation, compiled, LETTER, phrases, startPattern, type PhraseTable } from './phrases';
import type { GameLanguage, VerbTable } from './verbs';

/** At most this many options of a "Which do you mean" question get a chip; the others can still be typed. */
export const MAX_OPTIONS = 8;

/** Longest question taken for a parser's, in characters. */
const MAX_QUESTION = 200;
/** Longest question taken for a parser's on the signals that need no phrase, in characters. */
const MAX_PLAIN_QUESTION = 100;

const WORDS = new RegExp('[' + LETTER + ']+', 'g');

/** The parser asks for an object. */
export interface ParserQuestion {
  /** The objects the question names ("Which do you mean, the X or the Y?"), in order; empty when it names none. */
  options: string[];
  /**
   * The question does not say what it is for ("Pouvez-vous préciser ?"): the command it is about, which the chips
   * repeat and a noun completes ("examiner…" → "examiner lampe").
   */
  repeat?: string;
}

interface QuestionPatterns {
  /** Group 1: the list of objects. */
  which: RegExp;
  what: RegExp;
  whatEnd: RegExp;
  vague: RegExp;
  /** Between the options: "the X, the Y or the Z", "le X ou la Y", with or without a serial comma. */
  separator: RegExp;
  /** Before an option: an article or a possessive. */
  determiner: RegExp;
}

const patterns: Partial<Record<GameLanguage, QuestionPatterns>> = {};

function questionPatterns(table: PhraseTable): QuestionPatterns {
  return compiled(patterns, table, (t) => {
    const or = alternation(t.or);
    const prepositions = t.prepositions.length
      ? '(?:(?:' + alternation(t.prepositions) + ')\\s+)?'
      : '';
    const elided = t.determiners.filter((d) => /['’]$/.test(d));
    const spaced = t.determiners.filter((d) => !/['’]$/.test(d));
    return {
      which: startPattern(t.whichStarts, '\\s*[,:]?\\s*(.+?)\\s*\\?$'),
      what: t.whatStarts.length
        ? new RegExp(
            '^' +
              prepositions +
              '(?:' +
              alternation(t.whatStarts) +
              ')(?![' +
              LETTER +
              '])[^?]*\\?$',
            'i',
          )
        : /(?!)/,
      whatEnd: t.whatEnds.length
        ? new RegExp('(?:^|[^' + LETTER + '])(?:' + alternation(t.whatEnds) + ')\\s*\\?$', 'i')
        : /(?!)/,
      vague: startPattern(t.vagueStarts, '[^?]*\\?$'),
      separator: new RegExp('\\s*,\\s*(?:(?:' + or + ')\\s+)?|\\s+(?:' + or + ')\\s+', 'i'),
      determiner: new RegExp(
        '^(?:' +
          alternation(spaced) +
          ')\\s+' +
          (elided.length ? '|^(?:' + alternation(elided) + ')\\s*' : ''),
        'i',
      ),
    };
  });
}

/** A paragraph without the prompt the game may have printed after it (">"), trimmed. */
function withoutPrompt(text: string): string {
  return text.replace(/\s*>+\s*$/, '').trim();
}

/** An option as the player would type it: no article, no note in brackets, no quotes, lower case. */
function cleanOption(text: string, p: QuestionPatterns): string {
  return text
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^["'“‘«\s]+|["'”’»\s.]+$/g, '')
    .replace(p.determiner, '')
    .trim()
    .toLowerCase();
}

/** The objects named in the list of a "Which do you mean" question, without their articles, in order. */
export function questionOptions(list: string, language: GameLanguage = 'en'): string[] {
  const p = questionPatterns(phrases(language));
  const options: string[] = [];
  const parts = list.split(p.separator);
  for (let i = 0; i < parts.length && options.length < MAX_OPTIONS; i++) {
    const option = cleanOption(parts[i], p);
    if (option && options.indexOf(option) < 0) options.push(option);
  }
  return options;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(WORDS) || [];
}

/** The words of a command that may name an object: all but the verb, of 3 letters or more, not articles. */
function objectWords(command: string, p: QuestionPatterns): string[] {
  const words = wordsOf(command);
  const out: string[] = [];
  for (let i = words.length > 1 ? 1 : 0; i < words.length; i++) {
    if (words[i].length >= 3 && !p.determiner.test(words[i] + ' ')) out.push(words[i]);
  }
  return out;
}

function hasWord(text: string, words: string[]): boolean {
  const own = wordsOf(text);
  for (let i = 0; i < words.length; i++) if (own.indexOf(words[i]) >= 0) return true;
  return false;
}

/**
 * A list of objects sharing a word with the command, without any known phrase: "…, the red coat or the blue coat?"
 * after "examine coat". The question's own words before the first object are left out. Null for fewer than two.
 */
function sharedWordOptions(
  question: string,
  command: string,
  p: QuestionPatterns,
): string[] | null {
  const words = objectWords(command, p);
  if (!words.length) return null;
  const parts = question.replace(/\s*\?$/, '').split(p.separator);
  if (parts.length < 2) return null;
  const options: string[] = [];
  for (let i = 0; i < parts.length && options.length < MAX_OPTIONS; i++) {
    let part = parts[i];
    if (!hasWord(part, words)) continue;
    if (i === 0) {
      // "Précisez : le ciré jaune", "Cuál, el abrigo rojo": the object starts after a colon, or at its article.
      part = part.replace(/^.*:\s*/, '');
      const split = part.split(/\s+/);
      for (let w = split.length - 1; w > 0; w--) {
        if (p.determiner.test(split[w] + ' ')) {
          part = split.slice(w).join(' ');
          break;
        }
      }
      if (part.split(/\s+/).length > 4) continue;
    }
    const option = cleanOption(part, p);
    if (option && options.indexOf(option) < 0) options.push(option);
  }
  return options.length >= 2 ? options : null;
}

/** True when `command` is a verb of the bar that takes an object, sent alone ("examine", "parler à"). */
function verbAlone(command: string, table: VerbTable): boolean {
  const text = command.trim().toLowerCase();
  for (let i = 0; i < table.verbs.length; i++) {
    if (table.verbs[i].needsObject && table.verbs[i].command === text) return true;
  }
  return false;
}

/**
 * The parser's question for an object, when it is the last of the paragraphs printed since the last command (blank
 * ones and the bare prompt left out), in the game's language; null otherwise. `command` is that last command.
 */
export function parserQuestion(
  paragraphs: string[],
  table: VerbTable,
  command = '',
): ParserQuestion | null {
  const p = questionPatterns(phrases(table.language));
  const texts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = withoutPrompt(paragraphs[i]);
    if (text) texts.push(text);
  }
  if (!texts.length) return null;
  // Several lines in one paragraph ("(first taking the lamp)" before it): the question is the last one.
  const lines = texts[texts.length - 1].split(/\n/);
  const question = lines[lines.length - 1]
    .replace(/\s+/g, ' ')
    .replace(/^\[\s*|\s*\]$/g, '')
    .replace(/^[¿¡]+/, '')
    .trim();
  if (!question || question.length > MAX_QUESTION || !/\?$/.test(question)) return null;
  const sent = command.trim();

  // 1. The libraries' forms. A list of options has at least two, so a separator.
  const which = p.which.exec(question);
  if (which && p.separator.test(which[1])) {
    return { options: questionOptions(which[1], table.language) };
  }
  if (p.vague.test(question)) return sent ? { options: [], repeat: sent } : { options: [] };
  if (p.what.test(question) || p.whatEnd.test(question)) return { options: [] };

  // 2. Without a known phrase: a short question, alone since the command, that is not a yes/no one.
  if (!sent || texts.length > 1 || lines.length > 1 || question.length > MAX_PLAIN_QUESTION) {
    return null;
  }
  if (asksYesNo(question, table.language)) return null;
  const shared = sharedWordOptions(question, sent, p);
  if (shared) return { options: shared };
  if (verbAlone(sent, table)) return { options: [], repeat: sent };
  return null;
}
