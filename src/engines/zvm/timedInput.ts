// Timed input for ZVM (S1.25), which leaves it out (a "TODO" in ifvms 1.1.6). `@read` and `@read_char` in versions 4
// and later can carry a time (tenths of a second) and a routine: the routine is called each time that time passes while
// the game waits, and when it returns true the input ends (with terminator 0, or key 0). Added to one VM instance
// at runtime rather than patched into ifvms at build time, so unit tests (which load ZVM unpatched) run it too.
// The interval goes to the Glk library as a timer; the bridge sends its events, never faster than once a second.

/** A Glk window, as far as we look into glkapi's objects. */
interface GlkWindow {
  line_request: boolean;
  char_request: boolean;
  /** Set by glk_request_line_event from the window's echo flag: cancelling echoes the partial input when set. */
  request_echo_line_input: boolean | null;
}

interface RefStruct {
  get_field(index: number): unknown;
  set_field(index: number, value: unknown): void;
}

interface Glk {
  glk_request_timer_events(msec: number): void;
  glk_cancel_line_event(win: GlkWindow, event: RefStruct | null): void;
  glk_cancel_char_event(win: GlkWindow): void;
  glk_request_line_event_uni(win: GlkWindow, buffer: number[], initlen: number): void;
  RefStruct: new () => RefStruct;
}

interface ReadData {
  routine?: number;
  time?: number;
  buffer?: number[];
  storer: number;
}

/** The parts of ZVM's VM object used here (see ifvms `zvm.js`, `zvm/io.js`, `zvm/runtime.js`). */
interface ZvmInternals {
  Glk: Glk;
  pc: number;
  stop: number;
  quit: number;
  frames: number[];
  jit: Record<number, (vm: ZvmInternals) => number>;
  mainwin: GlkWindow | null;
  upperwin: GlkWindow | null;
  read_data: ReadData | null;
  glk_event: RefStruct;
  compile(): void;
  call(addr: number, storer: number, next: number, args: number[]): void;
  ret(result: number): void;
  /** Sets a variable, or reads it when no value is given (variable 0 pops the stack). */
  variable(variable: number, value?: number): number | undefined;
  read(storer: number, text: number, parse: number, time?: number, routine?: number): void;
  read_char(storer: number, one: number, time?: number, routine?: number): void;
  handle_char_input(charcode: number): void;
  handle_line_input(length: number, terminator: number): void;
  resume(arg?: unknown): void;
}

// Glk event types.
const EVTYPE_TIMER = 1;
const EVTYPE_CHAR = 2;
const EVTYPE_LINE = 3;

/**
 * Runs routine `routine` (packed address) to its end, nested in the waiting VM, and gives its return value. The VM
 * then waits again where it was: the routine returns to the instruction after the read.
 */
function callRoutine(vm: ZvmInternals, routine: number): number {
  const depth = vm.frames.length;
  // Stored on the stack (variable 0) of the frame that waits, and popped below: a routine can return from inside a
  // compiled block (a branch to "return true" calls `e.ret` itself), so its value is not always seen here.
  vm.call(routine, 0, vm.pc, []);
  vm.stop = 0;
  while (vm.frames.length > depth) {
    // The routine quit, or itself waited for input: the game cannot go on.
    if (vm.stop) {
      if (vm.quit) return 0;
      throw new Error('A timed input routine waited for input.');
    }
    const pc = vm.pc;
    if (!vm.jit[pc]) vm.compile();
    const result = vm.jit[pc](vm);
    if (!isNaN(result)) vm.ret(result);
  }
  return vm.variable(0) as number;
}

/** The window waiting for a line, or for a key. */
function waitingWindow(vm: ZvmInternals, kind: 'line' | 'char'): GlkWindow | null {
  const wins = [vm.mainwin, vm.upperwin];
  for (let i = 0; i < wins.length; i++) {
    const win = wins[i];
    if (win && (kind === 'line' ? win.line_request : win.char_request)) return win;
  }
  return null;
}

/** Makes the timed forms of `@read` and `@read_char` work on `vm` (a ZVM instance, before it starts). */
export function addTimedInput(zvm: object): void {
  const vm = zvm as ZvmInternals;
  const read = vm.read;
  const readChar = vm.read_char;
  const handleChar = vm.handle_char_input;
  const handleLine = vm.handle_line_input;
  const resume = vm.resume;
  // The routine ended the input: the key read is 0, a line's terminator is 0.
  let ended = false;

  function startTimer(
    kind: 'line' | 'char',
    time: number | undefined,
    routine: number | undefined,
  ) {
    const timed = !!time && !!routine && !!waitingWindow(vm, kind);
    vm.Glk.glk_request_timer_events(timed ? (time as number) * 100 : 0);
  }

  vm.read = function (storer, text, parse, time, routine) {
    read.call(vm, storer, text, parse, time, routine);
    startTimer('line', time, routine);
  };

  vm.read_char = function (storer, one, time, routine) {
    readChar.call(vm, storer, one, time, routine);
    startTimer('char', time, routine);
  };

  vm.handle_char_input = function (charcode) {
    if (!ended) {
      handleChar.call(vm, charcode);
      return;
    }
    ended = false;
    if (vm.read_data) vm.variable(vm.read_data.storer, 0);
  };

  // glkapi gives terminator 0 for a line ended by Return, which ZVM stores as is: a game that reads the terminator
  // (a timed line) would take it for a line ended by its routine. Return is 13.
  vm.handle_line_input = function (length, terminator) {
    const byRoutine = ended;
    ended = false;
    handleLine.call(vm, length, byRoutine ? 0 : terminator || 13);
  };

  /** A timer event: calls the routine; true when it ends the input (the event then stands for that input). */
  function onTimer(event: RefStruct): boolean {
    const data = vm.read_data;
    if (!data || !data.routine) return false;
    const Glk = vm.Glk;
    const line = waitingWindow(vm, 'line');
    const key = line ? null : waitingWindow(vm, 'char');
    if (!line && !key) return false;
    let typed = 0;
    if (line) {
      // Glk cannot print in a window waiting for a line: cancel it while the routine runs, without echoing it (the
      // reader keeps what the player is typing in its own field).
      line.request_echo_line_input = false;
      const cancelled = new Glk.RefStruct();
      Glk.glk_cancel_line_event(line, cancelled);
      typed = (cancelled.get_field(2) as number) || 0;
    }
    const ends = callRoutine(vm, data.routine);
    if (vm.quit) return false;
    if (!ends) {
      if (line && data.buffer) Glk.glk_request_line_event_uni(line, data.buffer, typed);
      return false;
    }
    Glk.glk_request_timer_events(0);
    ended = true;
    if (line) {
      // A line ended by the routine: what was typed, terminator 0.
      event.set_field(0, EVTYPE_LINE);
      event.set_field(1, line);
      event.set_field(2, typed);
      event.set_field(3, 0);
    } else if (key) {
      Glk.glk_cancel_char_event(key);
      event.set_field(0, EVTYPE_CHAR);
      event.set_field(1, key);
      event.set_field(2, 0);
    }
    return true;
  }

  vm.resume = function (arg) {
    const event = vm.glk_event;
    const type = event ? event.get_field(0) : null;
    try {
      if (type === EVTYPE_CHAR || type === EVTYPE_LINE) vm.Glk.glk_request_timer_events(0);
      else if (type === EVTYPE_TIMER) onTimer(event);
    } catch (error) {
      (vm.Glk as unknown as { fatal_error(error: unknown): void }).fatal_error(error);
      return;
    }
    // A timer event that did not end the input only waits again; one that did is handled as that input.
    resume.call(vm, arg);
  };
}
