// Engine selection by story format (SPEC §4.1; story S3.4). Each engine is its own lazy chunk, loaded only when a game
// of its format is played.
import type { StoryFormat } from '../../scripts/catalog/resolver';
import type { Engine, EngineKind } from './engine';

export type { StoryFormat };

const ENGINES: Record<StoryFormat, EngineKind> = {
  zcode: 'zmachine',
  glulx: 'glulx',
  ink: 'ink',
  twine: 'twine',
};

/** The engine that plays a catalogue format, or null for a format the app does not know. */
export function engineFor(format: string): EngineKind | null {
  return Object.prototype.hasOwnProperty.call(ENGINES, format)
    ? ENGINES[format as StoryFormat]
    : null;
}

type Loader = () => Promise<() => Engine>;

/** Engines shipped so far; the others arrive with their stories (Ink S1.8, Twine S1.9). */
const LOADERS: Partial<Record<EngineKind, Loader>> = {
  zmachine: () => import('./zvm/zvmEngine').then((module) => module.createZvmEngine),
  glulx: () => import('./quixe/quixeEngine').then((module) => () => module.createQuixeEngine()),
};

/** Whether this build can play games of `kind`. */
export function isAvailable(kind: EngineKind): boolean {
  return !!LOADERS[kind];
}

/** Loads the engine's chunk and returns its factory. Rejects for an engine not shipped yet. */
export function loadEngine(kind: EngineKind): Promise<() => Engine> {
  const loader = LOADERS[kind];
  return loader ? loader() : Promise.reject(new Error('No engine for ' + kind + ' yet'));
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/**
 * Whether `bytes` look like a story file for `kind`: a Blorb (IFF `FORM…IFRS`), else the format's own header. Catches a
 * web page or a wrong file before the engine chokes on it. Formats without a binary header pass.
 */
export function looksLikeStory(kind: EngineKind, bytes: Uint8Array): boolean {
  if (bytes.length >= 12 && fourCC(bytes, 0) === 'FORM') return fourCC(bytes, 8) === 'IFRS';
  if (kind === 'zmachine') return bytes.length >= 64 && bytes[0] >= 1 && bytes[0] <= 8;
  if (kind === 'glulx') return bytes.length >= 36 && fourCC(bytes, 0) === 'Glul';
  return true;
}
