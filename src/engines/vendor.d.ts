// Minimal types for the untyped CommonJS engines and Glk library (see scripts/build/vendor-patches.ts).

declare module 'ifvms' {
  export class ZVM {
    prepare(storydata: Uint8Array, options: Record<string, unknown>): void;
    init(): void;
    /** Writes a snapshot of the waiting VM (RAM as Quetzal, Glk state) to `options.Dialog.autosave_write`. */
    do_autosave(): void;
    /** Hex of the story header, set by `init`; identifies the story a snapshot belongs to. */
    signature: string;
  }
}

declare module 'ifvms/src/zvm/dispatch.js' {
  /** ZVM's Glk dispatch layer (object ids, retained arrays): the Glk library needs it to save its state. */
  export default class ZVMDispatch {}
}

declare module 'glkote-term/src/glkapi.js' {
  /** Creates a fresh Glk library instance (patched into a factory at build time). */
  export default function createGlk(): { init(options: Record<string, unknown>): void };
}
