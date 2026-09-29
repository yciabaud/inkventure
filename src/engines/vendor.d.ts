// Minimal types for the untyped CommonJS engines and Glk library (see scripts/build/glkapi-factory.ts).

declare module 'ifvms' {
  export class ZVM {
    prepare(storydata: Uint8Array, options: Record<string, unknown>): void;
    init(): void;
  }
}

declare module 'glkote-term/src/glkapi.js' {
  /** Creates a fresh Glk library instance (patched into a factory at build time). */
  export default function createGlk(): { init(options: Record<string, unknown>): void };
}
