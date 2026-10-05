// GlkOte-compatible display layer (SPEC §4.2). The Glk library (glkapi.js) drives it with JSON updates, as it would
// drive GlkOte in a browser page; we translate them into OutputBlocks and input requests instead of drawing windows,
// and send the player's input back as GlkOte events. No DOM: it runs headless in unit tests.
import type { InputRequest, OutputBlock, TextRun, TextStyle } from '../engine';

/** What the bridge reports to the engine adapter. */
export interface BridgeSink {
  output(blocks: OutputBlock[]): void;
  input(request: InputRequest): void;
  exit(): void;
  error(message: string): void;
}

/** The part of the Glk "game interface" object GlkOte uses. */
interface GameInterface {
  accept(event: Record<string, unknown>): void;
}

// GlkOte update format (see glkapi.js / the GlkOte spec). Only the fields we use.
/** A picture in a buffer window (`glk_image_draw`): the Blorb resource number, its size and alt text. */
interface ImageSpecial {
  special: 'image';
  image: number;
  width: number;
  height: number;
  alttext?: string;
}

type Content = Array<string | { style: string; text: string } | ImageSpecial>;

interface BufferLine {
  append?: boolean;
  content?: Content;
}

interface WindowUpdate {
  id: number;
  type: 'buffer' | 'grid' | 'graphics';
  gridwidth?: number;
  gridheight?: number;
}

interface ContentUpdate {
  id: number;
  clear?: boolean;
  text?: BufferLine[];
  lines?: Array<{ line: number; content?: Content }>;
}

interface InputUpdate {
  id: number;
  type?: 'line' | 'char';
  gen?: number;
  maxlen?: number;
}

export interface Update {
  type: string;
  gen: number;
  windows?: WindowUpdate[];
  content?: ContentUpdate[];
  input?: InputUpdate[];
  specialinput?: { type: string };
  /** GlkOte 2.3 (Quixe's Glk): the game has ended, in an `update`. Older libraries send `type: 'exit'` instead. */
  exit?: boolean;
  message?: string;
}

const STYLES: TextStyle[] = [
  'normal',
  'emphasized',
  'preformatted',
  'header',
  'subheader',
  'alert',
  'note',
  'blockquote',
  'input',
  'user1',
  'user2',
];

function toRuns(content: Content | undefined): TextRun[] {
  const runs: TextRun[] = [];
  if (!content) return runs;
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    let style: string;
    let text: string;
    if (typeof item === 'string') {
      style = item;
      const next = content[++i];
      text = typeof next === 'string' ? next : '';
    } else if ('special' in item) {
      continue;
    } else {
      style = item.style;
      text = item.text;
    }
    if (!text) continue;
    runs.push({
      text: text,
      style: STYLES.indexOf(style as TextStyle) >= 0 ? (style as TextStyle) : 'normal',
    });
  }
  return runs;
}

function isImage(item: Content[number] | undefined): item is ImageSpecial {
  return typeof item === 'object' && item !== null && 'special' in item && item.special === 'image';
}

/**
 * The blocks of one buffer window line: its text as a paragraph, and each picture in it as an image block on a line
 * of its own (the text around a picture becomes the paragraphs before and after it).
 */
function bufferLine(line: BufferLine): OutputBlock[] {
  const content = line.content || [];
  const blocks: OutputBlock[] = [];
  let from = 0;
  let pictures = 0;
  function text(to: number) {
    const runs = toRuns(content.slice(from, to));
    // A blank line is a paragraph, but not the empty text either side of a picture.
    if (runs.length || (!pictures && to === content.length)) {
      const block: OutputBlock = { type: 'paragraph', runs: runs };
      if (line.append && !pictures) block.append = true;
      blocks.push(block);
    }
  }
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (!isImage(item)) continue;
    text(i);
    pictures++;
    from = i + 1;
    const block: OutputBlock = {
      type: 'image',
      image: item.image,
      width: item.width,
      height: item.height,
    };
    if (item.alttext) block.alt = item.alttext;
    blocks.push(block);
  }
  text(content.length);
  return blocks;
}

function runsText(content: Content | undefined): string {
  const runs = toRuns(content);
  let text = '';
  for (let i = 0; i < runs.length; i++) text += runs[i].text;
  return text;
}

export class GlkOteBridge {
  private iface: GameInterface | null = null;
  private generation = 0;
  private windows: Record<number, WindowUpdate> = {};
  private grids: Record<number, string[]> = {};
  /** The main buffer window: the one that asked for input, else the first opened. */
  private main: number | null = null;
  /** The lines of the other buffer windows (Inform's quote box in Glulx, S1.23). */
  private quotes: Record<number, string[]> = {};
  /** Window waiting for input, and the kind of input. */
  private pending: { window: number; type: 'line' | 'char' } | null = null;
  /** The line just sent, until its window's next content: echoed again if the game clears that window (S1.16). */
  private sentLine: { window: number; text: string } | null = null;
  private exited = false;

  /** `dialog`: file storage, for Glk libraries that ask GlkOte for it (`getlibrary('Dialog')`, Quixe's). */
  constructor(
    private readonly sink: BridgeSink,
    private readonly columns: number,
    private readonly dialog: unknown = null,
  ) {}

  // ---- GlkOte API, called by glkapi.js ----

  init(iface: GameInterface): void {
    this.iface = iface;
    // Character cells of 1 px: the "screen" is `columns` characters wide, which sets the status line width.
    const metrics = {
      width: this.columns,
      height: 50,
      buffercharwidth: 1,
      buffercharheight: 1,
      buffermarginx: 0,
      buffermarginy: 0,
      gridcharwidth: 1,
      gridcharheight: 1,
      gridmarginx: 0,
      gridmarginy: 0,
      graphicsmarginx: 0,
      graphicsmarginy: 0,
      inspacingx: 0,
      inspacingy: 0,
      outspacingx: 0,
      outspacingy: 0,
    };
    // Runs the VM until it first waits for input.
    iface.accept({ type: 'init', gen: this.generation, metrics: metrics, support: [] });
  }

  update(data: Update): void {
    if (data.type === 'error') {
      this.error(data.message || 'Unknown error');
      return;
    }
    if (data.type === 'pass') return;
    if (data.type !== 'update' && data.type !== 'exit') return;
    if (data.gen <= this.generation) return;
    this.generation = data.gen;

    if (data.windows) this.updateWindows(data.windows);
    // The window that asks for input is the main one, for the text of this update too.
    if (data.input) {
      for (let i = 0; i < data.input.length; i++) {
        const win = this.windows[data.input[i].id];
        if (win && win.type === 'buffer') this.setMain(win.id);
      }
    }
    if (data.content && data.content.length) this.updateContent(data.content);
    if (data.specialinput) {
      // File prompts (the game's own SAVE / RESTORE / SCRIPT commands): cancelled, saves go through the reader's
      // menu instead. Answer once glkapi has finished this update.
      const iface = this.iface;
      const gen = this.generation;
      setTimeout(() => {
        if (iface) {
          iface.accept({
            type: 'specialresponse',
            gen: gen,
            response: 'fileref_prompt',
            value: null,
          });
        }
      }, 0);
    }
    if (data.input) this.updateInput(data.input);
    if (data.type === 'exit' || data.exit) {
      this.exited = true;
      this.pending = null;
      this.sink.exit();
    }
  }

  getinterface(): GameInterface | null {
    return this.iface;
  }

  getlibrary(name: string): unknown {
    return name === 'Dialog' ? this.dialog : null;
  }

  save_allstate(): Record<string, never> {
    return {};
  }

  log(): void {}

  warning(): void {}

  error(message: unknown): void {
    this.pending = null;
    this.sink.error(String(message));
  }

  extevent(): void {}

  // ---- Our API, called by the engine adapter ----

  sendLine(text: string): void {
    const pending = this.pending;
    if (!pending || pending.type !== 'line' || !this.iface) return;
    this.pending = null;
    this.sentLine = { window: pending.window, text: text };
    this.iface.accept({ type: 'line', gen: this.generation, window: pending.window, value: text });
  }

  sendChar(key: string): void {
    const pending = this.pending;
    if (!pending || pending.type !== 'char' || !this.iface) return;
    this.pending = null;
    this.iface.accept({ type: 'char', gen: this.generation, window: pending.window, value: key });
  }

  get hasExited(): boolean {
    return this.exited;
  }

  /** The kind of input the game waits for, or null (running, ended or failed). */
  get waitingFor(): 'line' | 'char' | null {
    return this.pending ? this.pending.type : null;
  }

  // ---- Update handling ----

  private updateWindows(windows: WindowUpdate[]): void {
    const next: Record<number, WindowUpdate> = {};
    for (let i = 0; i < windows.length; i++) {
      const win = windows[i];
      next[win.id] = win;
      if (win.type === 'grid') {
        const rows = win.gridheight || 0;
        const grid = this.grids[win.id] || [];
        grid.length = rows;
        for (let r = 0; r < rows; r++) if (grid[r] === undefined) grid[r] = '';
        this.grids[win.id] = grid;
      }
    }
    this.windows = next;
    if (this.main !== null && !next[this.main]) this.main = null;
    if (this.main === null) {
      for (const id in next) {
        if (next[id].type === 'buffer' && (this.main === null || +id < this.main)) this.main = +id;
      }
    }
    // Closed grid windows: the status line goes away. Closed quote windows: their box too.
    for (const id in this.grids) {
      if (!next[+id]) {
        delete this.grids[+id];
        this.sink.output([{ type: 'status', lines: [] }]);
      }
    }
    for (const id in this.quotes) {
      if (!next[+id] || +id === this.main) {
        delete this.quotes[+id];
        this.sink.output([{ type: 'quote', lines: [] }]);
      }
    }
  }

  private setMain(id: number): void {
    if (this.main === id) return;
    this.main = id;
    if (this.quotes[id]) {
      delete this.quotes[id];
      this.sink.output([{ type: 'quote', lines: [] }]);
    }
  }

  /** Text for a buffer window other than the main one: its lines, as a box (S1.23). */
  private quoteContent(update: ContentUpdate): OutputBlock {
    const lines = update.clear ? [] : this.quotes[update.id] || [];
    const text = update.text || [];
    for (let l = 0; l < text.length; l++) {
      const line = runsText(text[l].content);
      if (text[l].append && lines.length) lines[lines.length - 1] += line;
      else lines.push(line);
    }
    this.quotes[update.id] = lines;
    return { type: 'quote', lines: lines.slice(0) };
  }

  private updateContent(content: ContentUpdate[]): void {
    const blocks: OutputBlock[] = [];
    for (let i = 0; i < content.length; i++) {
      const update = content[i];
      const win = this.windows[update.id];
      if (!win) continue;
      if (win.type === 'buffer' && update.id !== this.main) {
        blocks.push(this.quoteContent(update));
      } else if (win.type === 'buffer') {
        const sent = this.sentLine;
        if (sent && sent.window === update.id) {
          this.sentLine = null;
          // Glk drops what the window showed before a clear, the command's echo too: keep the command before the new
          // screen, like an echo, so the turn that opened it is still in the transcript.
          if (update.clear && sent.text) {
            blocks.push({
              type: 'paragraph',
              runs: [{ text: sent.text, style: 'input' }],
              append: true,
            });
          }
        }
        if (update.clear) blocks.push({ type: 'clear' });
        const lines = update.text || [];
        for (let l = 0; l < lines.length; l++) {
          const line = bufferLine(lines[l]);
          for (let b = 0; b < line.length; b++) blocks.push(line[b]);
        }
      } else if (win.type === 'grid') {
        const grid = this.grids[update.id] || [];
        const lines = update.lines || [];
        for (let l = 0; l < lines.length; l++) grid[lines[l].line] = runsText(lines[l].content);
        this.grids[update.id] = grid;
        blocks.push({ type: 'status', lines: grid.slice(0) });
      }
    }
    if (blocks.length) this.sink.output(blocks);
  }

  private updateInput(inputs: InputUpdate[]): void {
    let request: { window: number; type: 'line' | 'char'; maxlen: number } | null = null;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (input.type === 'line' || input.type === 'char') {
        // Prefer the main (buffer) window when several windows ask for input.
        const win = this.windows[input.id];
        if (!request || (win && win.type === 'buffer')) {
          request = { window: input.id, type: input.type, maxlen: input.maxlen || 255 };
        }
      }
    }
    if (!request) {
      this.pending = null;
      return;
    }
    const same =
      this.pending && this.pending.window === request.window && this.pending.type === request.type;
    this.pending = { window: request.window, type: request.type };
    if (same) return;
    this.sink.input(
      request.type === 'line' ? { type: 'line', maxlen: request.maxlen } : { type: 'char' },
    );
  }
}

/**
 * In-memory stand-in for GlkOte's Dialog (file storage). `autosave` is the VM's autosave slot: ZVM writes its snapshot
 * there when asked to (`do_autosave`) and reads it back when it starts with `do_vm_autosave`; it writes null when a
 * snapshot fails to restore.
 */
export function createMemoryDialog(autosave: unknown = null) {
  const files: Record<string, string | Uint8Array> = {};
  function key(ref: { filename: string; usage: string }): string {
    return ref.usage + ':' + ref.filename;
  }
  let temp = 0;
  return {
    streaming: false,
    autosave: autosave,
    autosave_read() {
      return this.autosave;
    },
    autosave_write(_signature: string, snapshot: unknown) {
      this.autosave = snapshot;
    },
    file_construct_ref(filename: string, usage: string, gameid?: string) {
      return { filename: filename || 'file', usage: usage || '', gameid: gameid || '' };
    },
    file_construct_temp_ref(usage: string) {
      return { filename: '_temp' + ++temp, usage: usage || '' };
    },
    file_clean_fixed_name(filename: string) {
      return filename;
    },
    file_ref_exists(ref: { filename: string; usage: string }) {
      return key(ref) in files;
    },
    file_remove_ref(ref: { filename: string; usage: string }) {
      delete files[key(ref)];
    },
    file_read(ref: { filename: string; usage: string }) {
      const data = files[key(ref)];
      return data === undefined ? null : data;
    },
    file_write(ref: { filename: string; usage: string }, content: string | Uint8Array) {
      files[key(ref)] = content;
      return true;
    },
  };
}
