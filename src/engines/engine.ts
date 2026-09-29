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

/**
 * Output from the game.
 * - `paragraph`: one line of the transcript. With `append`, it continues the previous paragraph (e.g. the echoed
 *   command after the prompt).
 * - `status`: the whole status line (Z-machine upper window / Glk grid window), one string per row.
 * - `clear`: the game cleared its main window.
 */
export type OutputBlock =
  | { type: 'paragraph'; runs: TextRun[]; append?: boolean }
  | { type: 'status'; lines: string[] }
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
  saveState(): Promise<Uint8Array>;
  restoreState(data: Uint8Array): Promise<void>;
  undo(): Promise<boolean>;
}
