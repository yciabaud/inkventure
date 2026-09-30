// Game saves (SPEC §4.4, §6.1): the autosave and up to 5 named slots per game, plus the progress record Home shows.
// Imported directly (not from index.ts): it pulls in the deflate library, which stays out of the initial bundle.
import type { TextRun } from '../engines/engine';
import { compressBytes, compressText, decompressBytes, decompressText } from './compress';
import { keys } from './keys';
import type { Store } from './store';

export const SLOT_COUNT = 5;

/**
 * The transcript tail kept with a save (the Transcript view after a reload): the last TAIL_BLOCKS paragraphs with text,
 * up to TAIL_CHARS characters, far more than the last page needs at any font size.
 */
export const TAIL_CHARS = 20000;
export const TAIL_BLOCKS = 200;

/** What a save holds, uncompressed. */
export interface GameSnapshot {
  /** Engine state (`Engine.saveState`). */
  state: Uint8Array;
  /** Commands sent since the story began. */
  turn: number;
  /** The end of the transcript: paragraphs as styled runs, and the status line. */
  paragraphs: TextRun[][];
  status: string[];
}

/** Stored form, under `save:<tuid>:auto` and `save:<tuid>:<slot>`. */
interface SaveRecord {
  v: 1;
  /** Slot name given by the player (named slots only). */
  name?: string;
  date: number;
  turn: number;
  /** Deflated + base64: the engine state and the transcript tail (JSON). */
  data: string;
  text: string;
}

/** A named slot as the Save / Restore dialogs list it. */
export interface SlotInfo {
  slot: number;
  name: string;
  date: number;
  turn: number;
}

/** Progress record `progress:<tuid>` (the reader's per-game text settings live there too). */
export interface Progress {
  turns?: number;
  lastPlayed?: number;
  location?: string;
  [other: string]: unknown;
}

/**
 * Keeps the last paragraphs: up to TAIL_BLOCKS with text (blank lines between them are free) and TAIL_CHARS
 * characters, but at least one paragraph.
 */
export function transcriptTail(paragraphs: TextRun[][]): TextRun[][] {
  let chars = 0;
  let blocks = 0;
  let from = paragraphs.length;
  while (from > 0) {
    const runs = paragraphs[from - 1];
    let text = '';
    for (let i = 0; i < runs.length; i++) text += runs[i].text;
    chars += text.length;
    if (text.trim()) blocks++;
    if ((chars > TAIL_CHARS || blocks > TAIL_BLOCKS) && from < paragraphs.length) break;
    from--;
  }
  return paragraphs.slice(from);
}

function toRecord(snapshot: GameSnapshot, date: number, name?: string): SaveRecord {
  const record: SaveRecord = {
    v: 1,
    date: date,
    turn: snapshot.turn,
    data: compressBytes(snapshot.state),
    text: compressText(
      JSON.stringify({ paragraphs: transcriptTail(snapshot.paragraphs), status: snapshot.status }),
    ),
  };
  if (name !== undefined) record.name = name;
  return record;
}

function isRecord(value: unknown): value is SaveRecord {
  const record = value as SaveRecord | undefined;
  return (
    !!record &&
    record.v === 1 &&
    typeof record.data === 'string' &&
    typeof record.text === 'string' &&
    typeof record.turn === 'number'
  );
}

function fromRecord(record: unknown): GameSnapshot | undefined {
  if (!isRecord(record)) return undefined;
  try {
    const text = JSON.parse(decompressText(record.text)) as {
      paragraphs: TextRun[][];
      status: string[];
    };
    return {
      state: decompressBytes(record.data),
      turn: record.turn,
      paragraphs: Array.isArray(text.paragraphs) ? text.paragraphs : [],
      status: Array.isArray(text.status) ? text.status : [],
    };
  } catch {
    return undefined;
  }
}

function slotKey(tuid: string, slot: number): string {
  return keys.save(tuid, String(slot));
}

/**
 * Writes the autosave. Each save is a single storage entry, so a failed write (storage full: `StorageFullError`)
 * leaves the previous one intact.
 */
export function writeAutosave(store: Store, tuid: string, snapshot: GameSnapshot, date: number) {
  store.set(keys.autosave(tuid), toRecord(snapshot, date));
}

export function readAutosave(store: Store, tuid: string): GameSnapshot | undefined {
  return fromRecord(store.get(keys.autosave(tuid)));
}

export function clearAutosave(store: Store, tuid: string) {
  store.remove(keys.autosave(tuid));
}

/** Writes named slot `slot` (1 to SLOT_COUNT). Throws a `StorageFullError`, leaving the slot as it was, when full. */
export function writeSlot(
  store: Store,
  tuid: string,
  slot: number,
  name: string,
  snapshot: GameSnapshot,
  date: number,
) {
  if (slot < 1 || slot > SLOT_COUNT) throw new Error('No save slot ' + slot);
  store.set(slotKey(tuid, slot), toRecord(snapshot, date, name));
}

export function readSlot(store: Store, tuid: string, slot: number): GameSnapshot | undefined {
  return fromRecord(store.get(slotKey(tuid, slot)));
}

/** The named slots, 1 to SLOT_COUNT: null for an empty (or unreadable) slot. */
export function listSlots(store: Store, tuid: string): Array<SlotInfo | null> {
  const slots: Array<SlotInfo | null> = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const record = store.get(slotKey(tuid, slot));
    slots.push(
      isRecord(record)
        ? { slot: slot, name: record.name || '', date: record.date, turn: record.turn }
        : null,
    );
  }
  return slots;
}

export function readProgress(store: Store, tuid: string): Progress {
  const progress = store.get<Progress>(keys.progress(tuid));
  return progress && typeof progress === 'object' ? progress : {};
}

/** Updates the game's progress record, keeping its other fields (e.g. the reader's per-game settings). */
export function updateProgress(
  store: Store,
  tuid: string,
  patch: { turns: number; lastPlayed: number; location?: string },
) {
  const progress: Progress = { ...readProgress(store, tuid), ...patch };
  if (!patch.location) delete progress.location;
  store.set(keys.progress(tuid), progress);
}
