// Z-machine engine: ZVM from the ifvms.js project (Parchment, MIT) running on the Glk library from glkote-term (MIT),
// displayed through our GlkOte bridge. This module is its own lazy chunk: only the reader of a Z-machine game loads it.
import createGlk from 'glkote-term/src/glkapi.js';
import { ZVM } from 'ifvms';
import type { Engine, EngineOptions, InputRequest, OutputBlock } from '../engine';
import { createMemoryDialog, GlkOteBridge } from '../glkote-bridge/bridge';

// Inform's status line shows "Score: 3  Moves: 12" only on screens of about 66 columns or more ("3/12" below).
const DEFAULT_COLUMNS = 80;

function notYet(): Promise<never> {
  return Promise.reject(new Error('Not supported yet (saves and undo arrive with S1.5).'));
}

export function createZvmEngine(): Engine {
  let outputCb: (blocks: OutputBlock[]) => void = () => undefined;
  let inputCb: (req: InputRequest) => void = () => undefined;
  let exitCb: () => void = () => undefined;
  let errorCb: (message: string) => void = () => undefined;
  let bridge: GlkOteBridge | null = null;

  function fail(error: unknown) {
    errorCb(error instanceof Error ? error.message : String(error));
  }

  return {
    kind: 'zmachine',

    load(story: ArrayBuffer | string, opts: EngineOptions): Promise<void> {
      if (typeof story === 'string')
        return Promise.reject(new Error('A Z-machine story is binary.'));
      // Errors while the story starts (e.g. not a Z-code file) reject load() instead of reaching onError.
      let starting = true;
      let startError: string | null = null;
      bridge = new GlkOteBridge(
        {
          output: (blocks) => outputCb(blocks),
          input: (req) => inputCb(req),
          exit: () => exitCb(),
          error: (message) => {
            if (starting) startError = startError || message;
            else errorCb(message);
          },
        },
        opts.columns || DEFAULT_COLUMNS,
      );
      const vm = new ZVM();
      const Glk = createGlk();
      const options = { vm: vm, Glk: Glk, GlkOte: bridge, Dialog: createMemoryDialog() };
      try {
        vm.prepare(new Uint8Array(story), options);
        // Runs the story until it first waits for input (output and input requests arrive through the callbacks).
        Glk.init(options);
      } catch (error) {
        return Promise.reject(error);
      } finally {
        starting = false;
      }
      return startError ? Promise.reject(new Error(startError)) : Promise.resolve();
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
        if (bridge) bridge.sendLine(text);
      } catch (error) {
        fail(error);
      }
    },
    sendChar(key: string) {
      try {
        if (bridge) bridge.sendChar(key);
      } catch (error) {
        fail(error);
      }
    },
    choose() {
      // Parser games have no choices.
    },
    saveState: notYet,
    restoreState: notYet,
    undo: notYet,
  };
}
