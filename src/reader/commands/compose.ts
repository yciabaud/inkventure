// How chips and tapped words fill the command field (SPEC §3.6).
import type { Chip } from './verbs';

export type ChipAction = { send: string } | { field: string };

/** A verb or direction chip: sent at once, or (verbs ending with "…") put in the field to await a noun. */
export function applyChip(chip: Chip<string>): ChipAction {
  return chip.needsObject ? { field: chip.command + ' ' } : { send: chip.command };
}

/** Whether the field holds a verb waiting for its object ("take "). */
export function awaitsObject(field: string, verbs: Chip<string>[]): boolean {
  const text = field.replace(/\s+$/, '').toLowerCase();
  if (!text || field === text) return false;
  for (let i = 0; i < verbs.length; i++) {
    if (verbs[i].needsObject && verbs[i].command === text) return true;
  }
  return false;
}

/** A noun chip completes a waiting verb (and sends it); otherwise the noun is added to the field. */
export function applyNoun(field: string, noun: string, verbs: Chip<string>[]): ChipAction {
  if (awaitsObject(field, verbs)) return { send: field.replace(/\s+$/, '') + ' ' + noun };
  return { field: insertWord(field, noun) };
}

/** Appends a word to the field with a single space (tapped words, noun chips without a verb). */
export function insertWord(field: string, word: string): string {
  const clean = word.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+|[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/g, '').toLowerCase();
  if (!clean) return field;
  if (!field) return clean + ' ';
  return field.replace(/\s*$/, ' ') + clean + ' ';
}

/** Command history: `step` −1 goes to older commands, +1 to newer; past the newest, back to an empty field. */
export function browseHistory(
  history: string[],
  position: number,
  step: -1 | 1,
): { position: number; field: string } {
  const next = Math.max(0, Math.min(history.length, position + step));
  return { position: next, field: next < history.length ? history[next] : '' };
}
