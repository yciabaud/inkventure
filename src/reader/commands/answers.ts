// Answer chips (SPEC §3.6, story S1.17): when the game asks the player a question in its text and waits for a line,
// the answers it expects as chips: Yes / No for a yes/no question, the numbers of a numbered list of options. A
// heuristic over the last paragraphs before the prompt; the chips come first in the directions row, whose other
// chips stay in its dialog, so a wrong guess costs little.

import { shortLabel } from '../keys';
import {
  alternation,
  compiled,
  LETTER,
  phrases,
  startPattern,
  wordPattern,
  type PhraseTable,
} from './phrases';
import type { GameLanguage } from './verbs';

/** At most this many numbered options get a chip; the others can still be typed. */
export const MAX_OPTIONS = 9;

export interface AnswerChip {
  /** Shown on the chip: "Yes", or the option's number. */
  label: string;
  /** Sent to the game. */
  send: string;
  /** The start of a numbered option, shown after its number when there is room. */
  detail?: string;
}

interface YesNoPatterns {
  /** The game says what it expects: "Please answer yes or no.", "(y/n)". */
  explicit: RegExp;
  /** An auxiliary verb first ("Would you like…?", "Have you played…?")… */
  auxiliary: RegExp;
  /** …with the player in it, which a question in a description ("Is that a light?") does not have. */
  player: RegExp;
  /** A verb joined to a pronoun first: "Voulez-vous…?", "As-tu…?", "Puis-je…?". */
  inversion: RegExp;
  /** "Est-ce que vous…?". */
  questionStart: RegExp;
}

const patterns: Partial<Record<GameLanguage, YesNoPatterns>> = {};

function yesNoPatterns(table: PhraseTable): YesNoPatterns {
  return compiled(patterns, table, (t) => {
    // "(y/n)", "[o/n]": the keys, any spaces around the slash.
    const keys = alternation(t.yesNoKeys).replace(/\\\//g, '\\s*\\/\\s*');
    return {
      explicit: new RegExp(
        wordPattern(t.yesNoPhrases).source + '|[([]\\s*(?:' + keys + ')\\s*[)\\]]',
        'i',
      ),
      auxiliary: startPattern(t.auxiliaries),
      player: wordPattern(t.pronouns),
      inversion: t.inverted.length
        ? new RegExp(
            '^[' + LETTER + ']+-(?:' + alternation(t.inverted) + ')(?![' + LETTER + '])',
            'i',
          )
        : /(?!)/,
      questionStart: t.questionStarts.length
        ? new RegExp(
            startPattern(t.questionStarts).source + '.*' + wordPattern(t.pronouns).source,
            'i',
          )
        : /(?!)/,
    };
  });
}

// A numbered option on a line of its own: "1. …", "1) …", "(1) …".
const OPTION = /^\s*(?:\((\d{1,2})\)|(\d{1,2})[.)])\s+(\S.*)$/;
// Quotes and brackets around an option or a question.
const QUOTES = /^[\s"'“”‘’«»[(]+|[\s"'“”‘’«»\])]+$/g;
// Length of the start of an option shown on its chip.
const DETAIL_MAX = 24;

/** A paragraph without the prompt the game may have printed after it (">", ">>"), trimmed. */
function withoutPrompt(text: string): string {
  return text.replace(/\s*>+\s*$/, '').trim();
}

/** The last sentence of `text`, without the quotes around it. */
function lastSentence(text: string): string {
  const bare = text.replace(QUOTES, '');
  const sentences = bare.match(/[^.!?]+[.!?]*/g) || [bare];
  return sentences[sentences.length - 1].replace(QUOTES, '');
}

/** True when `text` (the last paragraph before the prompt) asks the player a yes/no question, in the game's language. */
export function asksYesNo(text: string, language: GameLanguage = 'en'): boolean {
  const p = yesNoPatterns(phrases(language));
  const paragraph = withoutPrompt(text);
  if (p.explicit.test(paragraph)) return true;
  if (!/\?["'”’»)\]]*$/.test(paragraph)) return false;
  const question = lastSentence(paragraph).replace(/^[¿¡]+/, '');
  if (p.auxiliary.test(question) && p.player.test(question)) return true;
  return p.inversion.test(question) || p.questionStart.test(question);
}

/**
 * The options of a numbered list that ends the text: consecutive paragraphs "1. …", "2. …" from 1, at least two,
 * optionally followed by one short line that asks for the choice ("Which one?", "Choose:"). Null when there is none.
 */
export function numberedOptions(paragraphs: string[]): AnswerChip[] | null {
  let end = paragraphs.length;
  // One line after the list that asks for the choice.
  if (end > 0 && !OPTION.test(paragraphs[end - 1])) {
    const last = withoutPrompt(paragraphs[end - 1]);
    if (last.length > 80 || !/[?:]["'”’»)\]]*$/.test(last)) return null;
    end--;
  }
  let start = end;
  while (start > 0 && OPTION.test(paragraphs[start - 1])) start--;
  if (end - start < 2) return null;
  const options: AnswerChip[] = [];
  for (let i = start; i < end; i++) {
    const match = OPTION.exec(paragraphs[i]);
    if (!match) return null;
    const number = Number(match[1] || match[2]);
    if (number !== i - start + 1) return null;
    if (options.length < MAX_OPTIONS) {
      const chip: AnswerChip = { label: String(number), send: String(number) };
      const detail = shortLabel(withoutPrompt(match[3]).replace(QUOTES, ''), DETAIL_MAX);
      if (detail) chip.detail = detail;
      options.push(chip);
    }
  }
  return options;
}

/**
 * The answer chips for the paragraphs printed since the last command (in order, blank ones left out), in the game's
 * language: the options of a numbered list that ends them, else Yes and No when the last one asks a yes/no question,
 * else none.
 */
export function findAnswers(paragraphs: string[], language: GameLanguage): AnswerChip[] {
  const texts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    // The bare prompt is not part of the question.
    if (withoutPrompt(paragraphs[i])) texts.push(paragraphs[i]);
  }
  if (!texts.length) return [];
  const options = numberedOptions(texts);
  if (options) return options;
  if (!asksYesNo(texts[texts.length - 1], language)) return [];
  const words = phrases(language).yesNo;
  return [
    { label: words[0][0], send: words[0][1] },
    { label: words[1][0], send: words[1][1] },
  ];
}
