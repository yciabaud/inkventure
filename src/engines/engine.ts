// Engine abstraction (SPEC §4.2): every story format implements this interface, so the reader is engine-agnostic.

export type EngineKind = 'zmachine' | 'glulx' | 'ink' | 'twine';

/** Glk text styles, as named by GlkOte. The reader maps them to typography. */
export type TextStyle =
  | 'normal'
  | 'emphasized'
  | 'preformatted'
  | 'header'
  | 'subheader'
  | 'alert'
  | 'note'
  | 'blockquote'
  | 'input'
  | 'user1'
  | 'user2';

export interface TextRun {
  text: string;
  style: TextStyle;
}

/** A picture of the story file (Blorb `Pict` resource `image`), with its size in px and its alt text when it has one. */
export interface ImageRef {
  image: number;
  width: number;
  height: number;
  alt?: string;
}

/**
 * Output from the game.
 * - `paragraph`: one line of the transcript. With `append`, it continues the previous paragraph (e.g. the echoed
 *   command after the prompt).
 * - `status`: the whole status line (Z-machine upper window / Glk grid window), one string per row.
 * - `image`: a picture drawn in the main window, on a line of its own (`Engine.imageUrl` gives its data).
 * - `clear`: the game cleared its main window.
 * - `quote`: the text of a window other than the main one and the status window (Inform's quote box in Glulx), one
 *   string per line; no lines when the window closes (S1.23).
 * A `paragraph` with `box` is part of a box the game drew in its upper window, kept in the transcript (S1.23).
 * A `status` or `quote` with `timer` was drawn on a timer event (S1.25): a box it replaces was a frame of an animation.
 */
export type OutputBlock =
  | { type: 'paragraph'; runs: TextRun[]; append?: boolean; box?: boolean }
  | { type: 'status'; lines: string[]; timer?: boolean }
  | { type: 'quote'; lines: string[]; timer?: boolean }
  | ({ type: 'image' } & ImageRef)
  | { type: 'clear' };

export interface LineInput {
  type: 'line';
  maxlen: number;
}

/** A single key press ("press any key", [MORE], menus). */
export interface CharInput {
  type: 'char';
}

export interface ChoiceInput {
  type: 'choice';
  choices: string[];
}

export type InputRequest = LineInput | CharInput | ChoiceInput;

export interface EngineOptions {
  /** Width of the status line, in characters. */
  columns?: number;
}

export interface Engine {
  kind: EngineKind;
  load(story: ArrayBuffer | string, opts: EngineOptions): Promise<void>;
  onOutput(cb: (blocks: OutputBlock[]) => void): void;
  onInputRequest(cb: (req: InputRequest) => void): void;
  /** The game has ended (quit, or the end of the story). */
  onExit(cb: () => void): void;
  /** The engine hit a fatal error; the game cannot continue. */
  onError(cb: (message: string) => void): void;
  sendLine(text: string): void;
  /** A key: a single character, or a Glk special key name such as `return`, `escape`, `left`. */
  sendChar(key: string): void;
  choose(index: number): void;
  /**
   * The whole game state, between turns (while the game waits for a line or a choice); rejects otherwise. Opaque bytes
   * that only the same engine and story can restore.
   */
  saveState(): Promise<Uint8Array>;
  /**
   * Continues from a saved state: the game then asks for input again (its text is not replayed, the reader keeps its
   * own transcript). Rejects, leaving the game as it was, when the data is not a state of this story.
   */
  restoreState(data: Uint8Array): Promise<void>;
  /** Starts the story again from the beginning. */
  restart(): Promise<void>;
  /** Takes back the last turn when the engine can; false lets the reader restore its previous snapshot instead. */
  undo(): Promise<boolean>;
  /**
   * Timer events on or off (S1.25, parser games): off while the reader does not show the game, and for good when it
   * closes. Engines without timers leave it out.
   */
  setTimersActive?(active: boolean): void;
  /** A URL (`data:`) of picture `image` of the loaded story, or null; only engines that draw pictures have it. */
  imageUrl?(image: number): string | null;
}
