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

// Quixe (vendor/quixe/, patched into ES modules at build time).

declare module '*/vendor/quixe/quixe.js' {
  export class QuixeClass {
    init(image: Uint8Array, options: Record<string, unknown>): void;
    /** Writes a snapshot of the VM waiting in glk_select (event struct at `eventaddr`) to `Dialog.autosave_write`. */
    do_autosave(eventaddr: number): void;
    /** Stops a VM that is being replaced: a time-sliced run does not continue. */
    abandon(): void;
  }
}

declare module '*/vendor/quixe/glkapi.js' {
  export class GlkClass {
    init(options: Record<string, unknown>): void;
  }
}

declare module '*/vendor/quixe/gi_dispa.js' {
  export class GiDispaClass {
    /** The event struct address of the pending glk_select, when a snapshot can be taken. */
    check_autosave(): number | null;
  }
}

declare module '*/vendor/quixe/gi_blorb.js' {
  export class BlorbClass {
    init(data: Uint8Array | unknown[], options?: Record<string, unknown>): void;
    get_exec_data(type: string): Uint8Array | null;
    /** A `data:` URL of picture `image` (a Pict resource), or null. */
    get_image_url(image: number): string | null;
  }
}

// The Decker reader's runtime (scripts/build/decker-runtime.ts): the URLs of its two scripts and of the tour deck.
declare module 'virtual:decker-runtime' {
  export const lilUrl: string;
  export const uiUrl: string;
  export const tourUrl: string;
}
