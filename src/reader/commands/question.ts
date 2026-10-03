// Parser questions (SPEC §3.6, story S1.21): when the last paragraph before the prompt is the parser asking for an
// object ("What do you want to examine?", "Which do you mean, the brass lamp or the oil lamp?"), the verbs row shows
// noun chips, and a tap sends the noun alone: the parser completes the command with it.
//
// The forms are those of the Inform libraries (see PATTERNS below for their source). Other systems that ask the same
// way are recognised too; the others keep the usual chips.

/** At most this many options of a "Which do you mean" question get a chip; the others can still be typed. */
export const MAX_OPTIONS = 8;

/** The parser asks for an object. */
export interface ParserQuestion {
  /** The objects the question names ("Which do you mean, the X or the Y?"), in order; empty when it names none. */
  options: string[];
}

// PATTERNS. Each must match the whole last paragraph, or its last line (prompt and the brackets of Inform 7 French
// left out), so a question inside the story's prose does not count. The libraries' sources:
// - Inform 6 English: library 6.12, english.h, Miscellany 45–49.
// - Inform 7 English: Standard Rules (6M62 and 10.x), responses of the parser clarification internal rule.
// - Inform 6 French: French.h by Jean-Luc Pontico (library 6/11), Miscellany 45–49; frenchU.h by Lionel Ange (library
//   6.12), Miscellany 45–49 and PronomInterrogatif in translation.h.
// - Inform 7 French: French Language by Nathanael Marion (v12 and v13), parser clarification internal rule.
// Each library prints the options with their definite article, joined by ", " and " or " / " ou " (a serial comma
// with an option); French puts a space (often no-break) before ":" and "?", or none (Pontico).
//
// A question that names the objects to choose from; group 1 is the list.
// - EN, I6 45 / 46 and I7 (A) / (B): "Who do you mean, " / "Which do you mean, " + the list + "?".
// - FR, Pontico 45 / 46 and I7 (A) / (B): "Précisez : " + the list + " ?".
// - FR, Ange 45 / 46: "Voulez-vous dire " + the list + " ?" (at least two options, so an "ou").
const WHICH = [
  /^(?:which|who)\s+do\s+you\s+mean\s*,?\s*(.+?)\s*\?$/i,
  /^précisez\s*:\s*(.+?)\s*\?$/i,
  /^voulez-vous\s+dire\s*,?\s*(.+\sou\s.+?)\s*\?$/i,
];
// A question for an object that names none.
// - EN, I6 48 / 49 and I7 (D) / (E): "Whom do you want [the actor] to <command so far>?" / "What do you want …?" ("What
//   do you want Bob to take?", "Whom do you want to give the apple to?"); I6 47 and I7 (C): "Sorry, you can only have
//   one item here. Which exactly?".
// - FR, Ange 48 / 49: "Que voulez-vous prendre ?", "Qui voulez-vous attaquer ?", "À qui voulez-vous donner la pomme ?"
//   (with the preposition typed: "Avec quoi …"); some games say "tu" ("Que veux-tu prendre ?").
// - FR, Pontico 48 / 49: "Pouvez-vous préciser ?"; I7 (D) / (E): "[Pouvez-vous préciser ce qui est concerné par cette
//   action ?]"; 47 and I7 (C): "… Lequel voulez-vous exactement ?", "… Lequel exactement ?".
const WHAT = [
  /^(?:what|whom|who)\s+(?:do|does|did)\s+(?:you|i|we|he|she|they|it)\s+want\b[^?]*\?$/i,
  /\bwhich\s+exactly\s*\?$/i,
  /^(?:(?:à|a|au|aux|sur|dans|avec|de|du|en|contre|sous|vers|par|pour|chez|derrière|devant|entre)\s+)?(?:qui|quoi|que)\s+(?:voulez-vous|veux-tu)\b[^?]*\?$/i,
  /^pouvez-vous\s+préciser\b[^?]*\?$/i,
  /\blequel\s+(?:voulez-vous\s+)?exactement\s*\?$/i,
];

// Between the options: "the X, the Y or the Z", "le X ou la Y", with or without a serial comma.
const SEPARATOR = /\s*,\s*(?:(?:or|ou)\s+)?|\s+(?:or|ou)\s+/i;
// Before an option: an article or a possessive ("the brass lamp", "your coat", "l'ancre").
const DETERMINER =
  /^(?:the|a|an|some|your|my|his|her|its|their|le|la|les|un|une|des|du|de\s+la|de\s+l['’]|votre|vos|ton|ta|tes|mon|ma|mes|son|sa|ses|leur|leurs)\s+|^l['’]\s*/i;
// After an option: what the parser says of it ("the lamp (providing light)").
const NOTE = /\s*\([^)]*\)\s*$/;

/** A paragraph without the prompt the game may have printed after it (">"), trimmed. */
function withoutPrompt(text: string): string {
  return text.replace(/\s*>+\s*$/, '').trim();
}

/** The objects named in the list of a "Which do you mean" question, without their articles, in order. */
export function questionOptions(list: string): string[] {
  const options: string[] = [];
  const parts = list.split(SEPARATOR);
  for (let i = 0; i < parts.length && options.length < MAX_OPTIONS; i++) {
    const option = parts[i]
      .replace(NOTE, '')
      .replace(/^["'“‘«\s]+|["'”’»\s.]+$/g, '')
      .replace(DETERMINER, '')
      .trim()
      .toLowerCase();
    if (option && options.indexOf(option) < 0) options.push(option);
  }
  return options;
}

/**
 * The parser's question for an object, when it is the last of the paragraphs printed since the last command (blank
 * ones and the bare prompt left out); null otherwise.
 */
export function parserQuestion(paragraphs: string[]): ParserQuestion | null {
  let last = '';
  for (let i = paragraphs.length - 1; i >= 0 && !last; i--) last = withoutPrompt(paragraphs[i]);
  // Several lines in one paragraph: the question is the last one.
  const lines = last.split(/\n/);
  const question = lines[lines.length - 1]
    .replace(/\s+/g, ' ')
    .replace(/^\[\s*|\s*\]$/g, '')
    .trim();
  if (!question || question.length > 200) return null;
  for (let i = 0; i < WHICH.length; i++) {
    const match = WHICH[i].exec(question);
    if (match) return { options: questionOptions(match[1]) };
  }
  for (let i = 0; i < WHAT.length; i++) {
    if (WHAT[i].test(question)) return { options: [] };
  }
  return null;
}
