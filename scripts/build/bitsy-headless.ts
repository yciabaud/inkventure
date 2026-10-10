// The Bitsy probe's runtime (scripts/build/bitsy-probe.ts) in a fresh jsdom window, for the unit tests and the
// bitsy-archive survey (scripts/survey/bitsy-archive.ts): frames run by hand, canvases replaced by a context that
// counts what is drawn (jsdom has no canvas).
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildRuntime } from './bitsy-probe.ts';

export const KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, SPACE: 32 };

export interface IkBitsy {
  scheduleFrame: (fn: () => void) => void;
  start: (canvas: unknown, game: string, font: string) => void;
  press: (code: number) => void;
  release: (code: number) => void;
  tap: () => void;
  wake: () => void;
  player: () => { room: string; x: number; y: number };
  grayPalette: (
    palette: number[],
    mode: string,
    tileStart: number,
    tileCount: number,
    background: number,
  ) => number[];
  roomContrast: (palette: number[], tileStart: number, tileCount: number) => number | null;
  ticks: number;
  draws: number;
  awake: number;
  dialog: boolean;
  roomName: string;
  contrast: number;
}

export interface HeadlessBitsy {
  window: JSDOM['window'];
  ik: IkBitsy;
  /** Canvas operations so far (fills, clears, image draws). */
  ops: { count: number };
  /** Frames waiting to run. */
  frames: (() => void)[];
  /** Runs the scheduled frames until the loop stops (at most `max`); returns how many ran. */
  flush: (max?: number) => number;
  /** A press and release of a key or pad button, then the frames it causes. */
  press: (code: number) => number;
  /** Errors thrown in the window (uncaught). */
  errors: string[];
}

let runtime: string | undefined;

export function headlessBitsy(): HeadlessBitsy {
  const dom = new JSDOM('<!doctype html><canvas id="game"></canvas>', {
    runScripts: 'outside-only',
  });
  const window = dom.window;
  const errors: string[] = [];
  window.addEventListener('error', (event) => errors.push(event.message));
  const ops = { count: 0 };
  const ctx = {
    fillStyle: '',
    fillRect: () => ops.count++,
    clearRect: () => ops.count++,
    drawImage: () => ops.count++,
  };
  (window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext =
    () => ctx;
  const frames: (() => void)[] = [];
  const ik = { scheduleFrame: (fn: () => void) => frames.push(fn) } as unknown as IkBitsy;
  (window as unknown as { ikBitsy: IkBitsy }).ikBitsy = ik;
  runtime ??= buildRuntime();
  window.eval(runtime);
  const flush = (max = 200) => {
    let n = 0;
    while (frames.length && n < max) {
      frames.shift()!();
      n++;
    }
    return n;
  };
  const press = (code: number) => {
    ik.press(code);
    ik.release(code);
    return flush();
  };
  return { window, ik, ops, frames, flush, press, errors };
}

/** Starts a game with the pinned default font and runs it until the loop stops. */
export function startGame(game: string): HeadlessBitsy {
  const run = headlessBitsy();
  const font = readFileSync('vendor/bitsy/ascii_small.bitsyfont', 'utf8');
  run.ik.start(run.window.document.getElementById('game'), game, font);
  run.flush();
  return run;
}
