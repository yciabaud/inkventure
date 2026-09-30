// Glulx engine: Quixe (Andrew Plotkin, MIT) with its own Glk library, displayed through our GlkOte bridge. This module
// is its own lazy chunk: only the reader of a Glulx game loads it. The Quixe files live in vendor/quixe/ and are
// patched into ES modules at build time (scripts/build/vendor-patches.ts), with time slicing.
import { strFromU8, strToU8 } from 'fflate';
import { BlorbClass } from '../../../vendor/quixe/gi_blorb.js';
import { GiDispaClass } from '../../../vendor/quixe/gi_dispa.js';
import { GlkClass } from '../../../vendor/quixe/glkapi.js';
import { QuixeClass } from '../../../vendor/quixe/quixe.js';
import type { Engine, EngineOptions, InputRequest, OutputBlock } from '../engine';
import { createMemoryDialog, GlkOteBridge } from '../glkote-bridge/bridge';

const DEFAULT_COLUMNS = 80;

/**
 * A run of the VM yields to the event loop after this long (SPEC §4.5), so the page can redraw and take taps during a
 * long turn on a slow e-reader. 0 runs each turn in one go.
 */
export const SLICE_MS = 100;

/** Marks our saved states: format and version of the envelope around Quixe's snapshot. */
const FORMAT = 'inkventure-quixe';
const VERSION = 1;

/** Quixe's autosave snapshot, as far as we touch it. */
interface Snapshot {
  /** RAM from `ramstart` to `endmem`, as numbers. */
  ram?: number[] | Uint8Array;
  /** Ours: the RAM XORed with the story's initial RAM (mostly zeros, so it compresses well), in base64. */
  ramx?: string;
  glk: { windows?: Array<{ reserve?: unknown[] }> };
  [other: string]: unknown;
}

interface Envelope {
  format: string;
  version: number;
  /** The story it belongs to: its first 64 bytes in hex (as Quixe's signature is meant to be). */
  signature: string;
  snapshot: Snapshot;
}

function hex(bytes: Uint8Array, length: number): string {
  let text = '';
  for (let i = 0; i < length && i < bytes.length; i++) {
    text += (bytes[i] < 0x10 ? '0' : '') + bytes[i].toString(16);
  }
  return text;
}

function read4(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.prototype.slice.call(bytes, i, i + CHUNK) as number[],
    );
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** XORs `ram` with the story's initial RAM (which is zero past the end of the file): its own inverse. */
function xorWithStory(ram: ArrayLike<number>, game: Uint8Array): Uint8Array {
  const ramstart = read4(game, 8);
  const out = new Uint8Array(ram.length);
  for (let i = 0; i < ram.length; i++) {
    const at = ramstart + i;
    out[i] = (ram[i] ^ (at < game.length ? game[at] : 0)) & 0xff;
  }
  return out;
}

/** The Glulx game in `data`: the file itself, or the GLUL chunk of a Blorb (whose images and data stay available). */
function unpack(data: Uint8Array): { game: Uint8Array; blorb: BlorbClass } {
  const blorb = new BlorbClass();
  const isBlorb =
    data.length >= 12 &&
    String.fromCharCode(data[0], data[1], data[2], data[3]) === 'FORM' &&
    String.fromCharCode(data[8], data[9], data[10], data[11]) === 'IFRS';
  if (!isBlorb) {
    blorb.init([]);
    return { game: data, blorb: blorb };
  }
  blorb.init(data, { format: 'blorbbytes', retainuses: { exec: true, pict: true, data: true } });
  const game = blorb.get_exec_data('GLUL');
  if (!game) throw new Error('This Blorb file holds no Glulx game.');
  return { game: new Uint8Array(game), blorb: blorb };
}

interface Running {
  vm: QuixeClass;
  bridge: GlkOteBridge;
  dispatch: GiDispaClass;
  dialog: ReturnType<typeof createMemoryDialog>;
}

export function createQuixeEngine(options: { sliceMs?: number } = {}): Engine {
  const sliceMs = options.sliceMs === undefined ? SLICE_MS : options.sliceMs;
  let outputCb: (blocks: OutputBlock[]) => void = () => undefined;
  let inputCb: (req: InputRequest) => void = () => undefined;
  let exitCb: () => void = () => undefined;
  let errorCb: (message: string) => void = () => undefined;
  let story: Uint8Array | null = null;
  let game: Uint8Array | null = null;
  let columns = DEFAULT_COLUMNS;
  let running: Running | null = null;

  function fail(error: unknown) {
    errorCb(error instanceof Error ? error.message : String(error));
  }

  /**
   * Starts a VM on the story, fresh or from a snapshot, and resolves once it first waits for input (or ends). Until
   * then its output is held back: when it fails (or the snapshot does not restore) the game already running stays as
   * it was and the promise rejects. Only the current VM reaches the callbacks.
   */
  function boot(snapshot: Snapshot | null): Promise<void> {
    if (!story || !game) return Promise.reject(new Error('No story loaded.'));
    const data = story;
    return new Promise<void>((resolve, reject) => {
      let live = false;
      let settled = false;
      const held: Array<() => void> = [];

      function deliver(fn: () => void) {
        if (live) {
          if (running === next) fn();
        } else {
          held.push(fn);
        }
      }

      function settle(error: string | null) {
        if (settled) return;
        settled = true;
        if (error === null && snapshot !== null && next.dialog.autosave === null) {
          // Quixe falls back to a fresh start (and clears the slot) when a snapshot fails to restore.
          error = 'The saved game could not be restored.';
        }
        if (error !== null) {
          next.vm.abandon();
          reject(new Error(error));
          return;
        }
        if (running) running.vm.abandon();
        running = next;
        live = true;
        for (let i = 0; i < held.length; i++) held[i]();
        resolve();
      }

      const dialog = createMemoryDialog(snapshot);
      // The bridge hands the Dialog to the Glk library (`GlkOte.getlibrary('Dialog')`).
      const bridge = new GlkOteBridge(
        {
          output: (blocks) => deliver(() => outputCb(blocks)),
          input: (req) => {
            deliver(() => inputCb(req));
            settle(null);
          },
          exit: () => {
            deliver(() => exitCb());
            settle(null);
          },
          error: (message) => {
            if (live) {
              if (running === next) errorCb(message);
            } else {
              settle(message);
            }
          },
        },
        columns,
        dialog,
      );
      let unpacked: ReturnType<typeof unpack>;
      try {
        unpacked = unpack(data);
      } catch (error) {
        reject(error);
        return;
      }
      const vm = new QuixeClass();
      const glk = new GlkClass();
      const dispatch = new GiDispaClass();
      const next: Running = { vm: vm, bridge: bridge, dispatch: dispatch, dialog: dialog };
      try {
        // Quixe restores `Dialog.autosave` at startup with do_vm_autosave; the Glk library itself must not autosave
        // every turn (the reader asks for snapshots).
        vm.init(unpacked.game, {
          io: glk,
          GiDispa: dispatch,
          GiLoad: null,
          do_vm_autosave: snapshot !== null,
          slice_ms: sliceMs,
        });
        glk.init({
          vm: vm,
          io: glk,
          GlkOte: bridge,
          GiDispa: dispatch,
          Blorb: unpacked.blorb,
          do_vm_autosave: false,
        });
      } catch (error) {
        if (!settled) {
          settled = true;
          vm.abandon();
          reject(error);
        }
      }
    });
  }

  return {
    kind: 'glulx',

    load(data: ArrayBuffer | string, opts: EngineOptions): Promise<void> {
      if (typeof data === 'string') return Promise.reject(new Error('A Glulx story is binary.'));
      story = new Uint8Array(data);
      try {
        game = unpack(story).game;
      } catch (error) {
        return Promise.reject(error);
      }
      columns = opts.columns || DEFAULT_COLUMNS;
      return boot(null);
    },

    onOutput(cb) {
      outputCb = cb;
    },
    onInputRequest(cb) {
      inputCb = cb;
    },
    onExit(cb) {
      exitCb = cb;
    },
    onError(cb) {
      errorCb = cb;
    },

    sendLine(text: string) {
      try {
        if (running) running.bridge.sendLine(text);
      } catch (error) {
        fail(error);
      }
    },
    sendChar(key: string) {
      try {
        if (running) running.bridge.sendChar(key);
      } catch (error) {
        fail(error);
      }
    },
    choose() {
      // Parser games have no choices.
    },

    saveState(): Promise<Uint8Array> {
      const current = running;
      if (!current || !game || current.bridge.waitingFor !== 'line')
        return Promise.reject(new Error('The game can only be saved between turns.'));
      try {
        const eventaddr = current.dispatch.check_autosave();
        if (!eventaddr) return Promise.reject(new Error('The game cannot be saved just now.'));
        current.vm.do_autosave(eventaddr);
        const snapshot = current.dialog.autosave as Snapshot;
        const ram = snapshot.ram as ArrayLike<number>;
        // The RAM as a compact delta; the rest is copied through JSON, without the text Glk keeps for redrawing
        // windows (the reader restores its own transcript).
        const copy = JSON.parse(JSON.stringify({ ...snapshot, ram: undefined })) as Snapshot;
        copy.ramx = toBase64(xorWithStory(ram, game));
        const windows = copy.glk.windows || [];
        for (let i = 0; i < windows.length; i++) if (windows[i].reserve) windows[i].reserve = [];
        const envelope: Envelope = {
          format: FORMAT,
          version: VERSION,
          signature: hex(game, 64),
          snapshot: copy,
        };
        return Promise.resolve(strToU8(JSON.stringify(envelope)));
      } catch (error) {
        return Promise.reject(error);
      }
    },

    restoreState(data: Uint8Array): Promise<void> {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(strFromU8(data)) as Envelope;
      } catch {
        return Promise.reject(new Error('Not a saved game.'));
      }
      if (
        !envelope ||
        envelope.format !== FORMAT ||
        envelope.version !== VERSION ||
        !envelope.snapshot ||
        typeof envelope.snapshot.ramx !== 'string'
      )
        return Promise.reject(new Error('Not a saved game.'));
      if (!game || envelope.signature !== hex(game, 64))
        return Promise.reject(new Error('This saved game belongs to another story.'));
      let ram: Uint8Array;
      try {
        ram = xorWithStory(fromBase64(envelope.snapshot.ramx), game);
      } catch {
        return Promise.reject(new Error('Not a saved game.'));
      }
      const snapshot: Snapshot = { ...envelope.snapshot, ram: ram };
      delete snapshot.ramx;
      return boot(snapshot);
    },

    restart(): Promise<void> {
      return boot(null);
    },

    undo(): Promise<boolean> {
      // Quixe's own undo (@restoreundo) is driven by the game's UNDO command; the reader falls back to its snapshots.
      return Promise.resolve(false);
    },
  };
}
