// Rendering survey (story S7.3): plays one parser game headless with the app's own engines and GlkOte bridge, and
// reports what the reader would show wrong. Loaded through Vite (rendering.ts) so the engines get the vendor patches,
// as in the app and the unit tests.
import { ZVM } from 'ifvms';
import type { Engine, InputRequest } from '../../src/engines/engine';
import { GlkOteBridge } from '../../src/engines/glkote-bridge/bridge';
import { createQuixeEngine } from '../../src/engines/quixe/quixeEngine';
import {
  applyOutput,
  EMPTY_TRANSCRIPT,
  splitUpper,
  type Transcript,
} from '../../src/engines/transcript';
import { createZvmEngine } from '../../src/engines/zvm/zvmEngine';
import { isUpperScreen, upperRows } from '../../src/reader/upperWindow';
import { MAX_STATUS_ROWS } from '../../src/engines/transcript';
import { analyse, Findings, type Finding, type RawUpdate, type Recorded } from './detect';

/** The commands typed after the intro; a menu they open is browsed with MENU_KEYS. */
export const COMMANDS = ['look', 'inventory', 'help', 'about', 'verbose', 'x me'];
/** Keys sent while a command's menu (or any key prompt) waits: next, open, back, then quit. */
export const MENU_KEYS = ['n', 'return', ' ', 'q', 'q', 'q', ' ', 'return', ' ', 'q'];

export interface PlayResult {
  findings: Finding[];
  /** Commands and keys sent. */
  turns: number;
}

// Every bridge reports its updates here while a game plays.
let recording: { step: string; records: Recorded[] } | null = null;
const proto = GlkOteBridge.prototype as unknown as { update(data: unknown): void };
const original = proto.update;
proto.update = function (data: unknown) {
  if (recording) recording.records.push({ step: recording.step, update: clone(data) as RawUpdate });
  return original.call(this, data);
};

// The Z-machine's reverse video never reaches GlkOte (ZVM only sends it to Gargoyle's Glk), so it is read from ZVM's
// @set_style: per row of the upper window, whether text was set in reverse video or in roman.
let reverseRows: Record<number, { reverse: boolean; roman: boolean }> = {};
interface ZvmIo {
  io: { currentwin: number; row: number };
}
const zvm = (ZVM as unknown as { prototype: { set_style(this: ZvmIo, style: number): void } })
  .prototype;
const setStyle = zvm.set_style;
zvm.set_style = function (this: ZvmIo, style: number) {
  if (this.io && this.io.currentwin) {
    const row =
      reverseRows[this.io.row] || (reverseRows[this.io.row] = { reverse: false, roman: false });
    if (style & 1) row.reverse = true;
    else if (style === 0) row.roman = true;
  }
  return setStyle.call(this, style);
};

/** Rows below the first set in reverse video while others are not (a selection), since the last prompt. */
function reverseHighlight(): string | null {
  const rows = Object.keys(reverseRows).map(Number);
  // The first row in reverse video is the status line or a title bar, as in every Inform game.
  const reverse = rows.filter((r) => r > 0 && reverseRows[r].reverse && !reverseRows[r].roman);
  const roman = rows.filter((r) => !reverseRows[r].reverse && reverseRows[r].roman);
  reverseRows = {};
  return reverse.length && roman.length
    ? 'reverse video on row ' + reverse.map((r) => r + 1).join(', ')
    : null;
}

function clone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function text(transcript: Transcript): string {
  return transcript.paragraphs.map((p) => p.text).join('\n');
}

/**
 * Plays `story` (a Z-machine or Glulx file, Blorb or not): the intro (any key until the first line prompt), then
 * `commands` (COMMANDS), each menu browsed with MENU_KEYS. Stops at the end of the script, when the game ends, or after
 * `timeLimit` ms (a step waiting longer than `stepLimit` ms counts as a hang).
 */
export async function play(
  story: ArrayBuffer,
  kind: 'zmachine' | 'glulx',
  timeLimit = 60000,
  stepLimit = 15000,
  commands: string[] = COMMANDS,
): Promise<PlayResult> {
  const findings = new Findings();
  const records: Recorded[] = [];
  recording = { step: 'intro', records: records };
  reverseRows = {};
  const started = Date.now();
  const engine: Engine = kind === 'glulx' ? createQuixeEngine() : createZvmEngine();
  let transcript = EMPTY_TRANSCRIPT;
  let request: InputRequest | null = null;
  let ended = false;
  let turns = 0;
  engine.onOutput((blocks) => {
    transcript = applyOutput(transcript, blocks);
  });
  engine.onInputRequest((next) => {
    request = next;
  });
  engine.onExit(() => {
    ended = true;
  });
  engine.onError((message) => {
    findings.add('error', recording ? recording.step : '?', message.slice(0, 120));
    ended = true;
  });

  /** Waits for the next input request; false when the game ended, failed or hung. */
  async function next(step: string): Promise<boolean> {
    const since = Date.now();
    while (!request && !ended) {
      if (Date.now() - since > stepLimit || Date.now() - started > timeLimit) {
        findings.add(
          'timeout',
          step,
          'no prompt after ' + Math.round((Date.now() - since) / 1000) + ' s',
        );
        ended = true;
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (ended) return false;
    observe(step);
    return true;
  }

  /** What the reader does with the windows at this prompt. */
  function observe(step: string) {
    const waiting = request as InputRequest;
    const highlight = reverseHighlight();
    if (highlight) findings.add('grid-styles', step, highlight);
    const rows = upperRows(transcript.status).length;
    const key = waiting.type === 'char';
    const boxed = !!transcript.box && !transcript.cleared;
    const top = upperRows(boxed ? splitUpper(transcript.status).status : transcript.status).length;
    if (isUpperScreen(transcript.status, !!transcript.cleared, key)) {
      findings.add('upper-screen', step, rows + ' rows');
    } else if (top > MAX_STATUS_ROWS) {
      findings.add('tall-upper', step, top + ' rows, ' + (key ? 'key' : 'line') + ' input');
    }
    if (boxed && !isUpperScreen(transcript.status, !!transcript.cleared, key)) {
      const box = transcript.box ? transcript.box.paragraphs : [];
      findings.add(
        'upper-box',
        step,
        (transcript.quote ? 'quote window' : 'under ' + top + ' status rows') +
          ', ' +
          (key ? 'key' : 'line') +
          ' input: ' +
          JSON.stringify(box.map((p) => p.text).join(' / ')).slice(0, 80),
      );
    }
  }

  function send(step: string, value: string, char: boolean) {
    recording = { step: step, records: records };
    request = null;
    turns++;
    if (char) engine.sendChar(value);
    else engine.sendLine(value);
  }

  try {
    await engine.load(story, { columns: 80 });
    let ok = await next('intro');
    // The intro: any key until the first line prompt.
    for (let i = 0; ok && i < 8 && (request as InputRequest | null)?.type === 'char'; i++) {
      send('intro', ' ', true);
      ok = await next('intro');
    }
    for (const command of commands) {
      if (!ok || Date.now() - started > timeLimit) break;
      const current = request as InputRequest | null;
      if (!current || current.type !== 'line') break;
      const before = text(transcript);
      const status = transcript.status.join('\n');
      send(command, command, false);
      ok = await next(command);
      if (ok && text(transcript) === before && transcript.status.join('\n') === status) {
        findings.add('no-output', command, 'nothing printed');
      }
      // A menu or "press a key": browse it, then back to a line prompt.
      for (
        let k = 0;
        ok && (request as InputRequest | null)?.type === 'char' && k < MENU_KEYS.length;
        k++
      ) {
        const key = MENU_KEYS[k];
        send(command + ': ' + (key === ' ' ? 'space' : key), key, true);
        ok = await next(command + ': ' + key);
      }
      for (let k = 0; ok && (request as InputRequest | null)?.type === 'char' && k < 6; k++) {
        send(command + ': escape', 'escape', true);
        ok = await next(command + ': escape');
      }
    }
  } catch (error) {
    findings.add('error', recording ? recording.step : 'load', String(error).slice(0, 120));
  } finally {
    recording = null;
  }
  // Boxes kept in the text, counted as runs of box paragraphs.
  let boxes = 0;
  transcript.paragraphs.forEach((p, i) => {
    if (p.box && !(i > 0 && transcript.paragraphs[i - 1].box)) boxes++;
  });
  if (boxes >= 3) findings.add('many-boxes', 'end', boxes + ' boxes kept');
  analyse(records, findings);
  return { findings: findings.list, turns: turns };
}
