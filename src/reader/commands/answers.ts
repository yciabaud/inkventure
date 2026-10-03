// Answer chips (SPEC §3.6, story S1.17): when the game asks the player a question in its text and waits for a line,
// the answers it expects as chips: Yes / No for a yes/no question, the numbers of a numbered list of options. A
// heuristic over the last paragraphs before the prompt; the chips come first in the directions row, whose other
// chips stay in its dialog, so a wrong guess costs little.

import { shortLabel } from '../keys';
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

/** Yes and No in each game language: [label, command]. */
const YES_NO: Record<GameLanguage, [[string, string], [string, string]]> = {
  en: [
    ['Yes', 'yes'],
    ['No', 'no'],
  ],
  fr: [
    ['Oui', 'oui'],
    ['Non', 'non'],
  ],
  es: [
    ['Sí', 'si'],
    ['No', 'no'],
  ],
  de: [
    ['Ja', 'ja'],
    ['Nein', 'nein'],
  ],
  it: [
    ['Sì', 'si'],
    ['No', 'no'],
  ],
};

// The game says what it expects: "Please answer yes or no.", "(y/n)", "oui ou non".
const EXPLICIT = /\b(yes or no|yes\/no|oui ou non|oui\/non)\b|[([]\s*[yo]\s*\/\s*n\s*[)\]]/i;
// A yes/no question to the player: an auxiliary verb first ("Would you like…?", "Have you played…?", "Can you hear
// me?"), with the player in it, which a question in a description ("Is that a light?") does not have.
const AUXILIARY =
  /^(do|does|did|would|will|can|could|shall|should|are|is|was|were|have|has|had|may|might|must|want)\b/i;
const PLAYER = /\b(you|your|i|we)\b/i;
// French: "Voulez-vous…?", "As-tu…?", "Puis-je…?", or "Est-ce que vous…?".
const INVERSION = /^[a-zà-ÿ]+-(vous|tu|je|nous)\b/i;
const EST_CE_QUE = /^est-ce qu(e|')\s*.*\b(vous|tu|je|nous)\b/i;
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

/** True when `text` (the last paragraph before the prompt) asks the player a yes/no question. */
export function asksYesNo(text: string): boolean {
  const paragraph = withoutPrompt(text);
  if (EXPLICIT.test(paragraph)) return true;
  if (!/\?["'”’»)\]]*$/.test(paragraph)) return false;
  const question = lastSentence(paragraph);
  if (AUXILIARY.test(question) && PLAYER.test(question)) return true;
  return INVERSION.test(question) || EST_CE_QUE.test(question);
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
  if (!asksYesNo(texts[texts.length - 1])) return [];
  const words = YES_NO[language] || YES_NO.en;
  return [
    { label: words[0][0], send: words[0][1] },
    { label: words[1][0], send: words[1][1] },
  ];
}
