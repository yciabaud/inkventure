// Z-machine engine: ZVM from the ifvms.js project (Parchment, MIT) running on the Glk library from glkote-term (MIT),
// displayed through our GlkOte bridge. This module is its own lazy chunk: only the reader of a Z-machine game loads it.
import { strFromU8, strToU8 } from 'fflate';
import createGlk from 'glkote-term/src/glkapi.js';
import { ZVM } from 'ifvms';
import ZVMDispatch from 'ifvms/src/zvm/dispatch.js';
import type { Engine, EngineOptions, InputRequest, OutputBlock } from '../engine';
import { createMemoryDialog, GlkOteBridge } from '../glkote-bridge/bridge';
import { addTimedInput } from './timedInput';

// Inform's status line shows "Score: 3  Moves: 12" only on screens of about 66 columns or more ("3/12" below).
const DEFAULT_COLUMNS = 80;

/** Marks our saved states: format and version of the envelope around ZVM's snapshot. */
const FORMAT = 'inkventure-zvm';
const VERSION = 1;

interface Envelope {
  format: string;
  version: number;
  /** The story it belongs to (ZVM's signature: the story header in hex). */
  signature: string;
  /** ZVM's autosave snapshot: the RAM and stacks as a Quetzal file, plus the Glk library state. */
  snapshot: { glk: { windows: Array<{ reserve?: unknown[] }> } };
}

/** ZVM's signature of a story: the first 30 bytes of its header in hex (see ifvms `zvm.js`). */
function storySignature(story: Uint8Array): string {
  let signature = '';
  for (let i = 0; i < 0x1e; i++) signature += (story[i] < 0x10 ? '0' : '') + story[i].toString(16);
  return signature;
}

interface Running {
  vm: ZVM;
  bridge: GlkOteBridge;
  dialog: ReturnType<typeof createMemoryDialog>;
}

export function createZvmEngine(): Engine {
  let outputCb: (blocks: OutputBlock[]) => void = () => undefined;
  let inputCb: (req: InputRequest) => void = () => undefined;
  let exitCb: () => void = () => undefined;
  let errorCb: (message: string) => void = () => undefined;
  let story: Uint8Array | null = null;
  let columns = DEFAULT_COLUMNS;
  let running: Running | null = null;
  let timersActive = true;

  function fail(error: unknown) {
    errorCb(error instanceof Error ? error.message : String(error));
  }

  /**
   * Starts a VM on the story, fresh or from a snapshot. Until it has started, its output is held back: when it fails
   * (or the snapshot does not restore) the game already running stays as it was and the promise rejects.
   */
  function boot(snapshot: unknown): Promise<void> {
    if (!story) return Promise.reject(new Error('No story loaded.'));
    let live = false;
    const held: Array<() => void> = [];
    const deliver = (fn: () => void) => (live ? fn() : held.push(fn));
    let startError: string | null = null;
    const bridge = new GlkOteBridge(
      {
        output: (blocks) => deliver(() => outputCb(blocks)),
        input: (req) => deliver(() => inputCb(req)),
        exit: () => deliver(() => exitCb()),
        error: (message) => {
          if (live) errorCb(message);
          else startError = startError || message;
        },
      },
      columns,
    );
    bridge.setTimersActive(timersActive);
    const vm = new ZVM();
    addTimedInput(vm);
    const Glk = createGlk();
    const dialog = createMemoryDialog(snapshot);
    try {
      // ZVM restores `Dialog.autosave` when it starts with do_vm_autosave; the Glk library itself must not autosave.
      vm.prepare(story.slice(0), {
        Glk: Glk,
        GlkOte: bridge,
        Dialog: dialog,
        do_vm_autosave: snapshot !== null,
      });
      // Runs the story until it first waits for input (output and input requests arrive through the callbacks).
      // ZVM's dispatch layer lets the Glk library save its state (windows, pending line input) for snapshots.
      Glk.init({ vm: vm, Glk: Glk, GlkOte: bridge, Dialog: dialog, GiDispa: new ZVMDispatch() });
    } catch (error) {
      bridge.dispose();
      return Promise.reject(error);
    }
    if (startError) {
      bridge.dispose();
      return Promise.reject(new Error(startError));
    }
    // ZVM falls back to a fresh start (and clears the slot) when a snapshot fails to restore.
    if (snapshot !== null && dialog.autosave === null) {
      bridge.dispose();
      return Promise.reject(new Error('The saved game could not be restored.'));
    }
    if (running) running.bridge.dispose();
    running = { vm: vm, bridge: bridge, dialog: dialog };
    live = true;
    for (let i = 0; i < held.length; i++) held[i]();
    return Promise.resolve();
  }

  return {
    kind: 'zmachine',

    load(data: ArrayBuffer | string, opts: EngineOptions): Promise<void> {
      if (typeof data === 'string')
        return Promise.reject(new Error('A Z-machine story is binary.'));
      story = new Uint8Array(data);
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
    setTimersActive(active: boolean) {
      timersActive = active;
      if (running) running.bridge.setTimersActive(active);
    },

    saveState(): Promise<Uint8Array> {
      if (!running || running.bridge.waitingFor !== 'line')
        return Promise.reject(new Error('The game can only be saved between turns.'));
      try {
        running.vm.do_autosave();
        const envelope: Envelope = {
          format: FORMAT,
          version: VERSION,
          signature: running.vm.signature,
          snapshot: running.dialog.autosave as Envelope['snapshot'],
        };
        // JSON copy, without the text Glk keeps for redrawing windows: the reader restores its own transcript.
        const copy = JSON.parse(JSON.stringify(envelope)) as Envelope;
        const windows = copy.snapshot.glk.windows;
        for (let i = 0; i < windows.length; i++) if (windows[i].reserve) windows[i].reserve = [];
        return Promise.resolve(strToU8(JSON.stringify(copy)));
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
      if (!envelope || envelope.format !== FORMAT || envelope.version !== VERSION)
        return Promise.reject(new Error('Not a saved game.'));
      if (!story || envelope.signature !== storySignature(story))
        return Promise.reject(new Error('This saved game belongs to another story.'));
      return boot(envelope.snapshot);
    },

    restart(): Promise<void> {
      return boot(null);
    },

    undo(): Promise<boolean> {
      // ZVM's own undo (@restore_undo) is driven by the game's UNDO command; the reader falls back to its snapshots.
      return Promise.resolve(false);
    },
  };
}
