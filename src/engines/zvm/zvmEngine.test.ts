// @vitest-environment node
// Headless adapter test: the fixture Z-machine game played through ZVM, glkapi and our GlkOte bridge, no DOM.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Engine, InputRequest } from '../engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../transcript';
import { createZvmEngine } from './zvmEngine';

const STORY = readFileSync('tests/fixtures/zmachine/lamp.z5');

interface Session {
  engine: Engine;
  transcript(): Transcript;
  input(): InputRequest | null;
  exited(): boolean;
  errors: string[];
  /** Text output since the last call. */
  take(): string;
}

async function start(): Promise<Session> {
  const engine = createZvmEngine();
  let transcript = EMPTY_TRANSCRIPT;
  let request: InputRequest | null = null;
  let exited = false;
  let read = 0;
  const errors: string[] = [];
  engine.onOutput((blocks) => {
    transcript = applyOutput(transcript, blocks);
  });
  engine.onInputRequest((req) => {
    request = req;
  });
  engine.onExit(() => {
    exited = true;
    request = null;
  });
  engine.onError((message) => errors.push(message));
  const story = STORY.buffer.slice(STORY.byteOffset, STORY.byteOffset + STORY.byteLength);
  await engine.load(story, { columns: 80 });
  return {
    engine,
    transcript: () => transcript,
    input: () => request,
    exited: () => exited,
    errors,
    take() {
      const paragraphs = transcript.paragraphs;
      // Re-read the last paragraph read, it may have been appended to (prompt + echoed command).
      const from = Math.max(read - 1, 0);
      read = paragraphs.length;
      return paragraphs
        .slice(from)
        .map((p) => p.text)
        .join('\n');
    },
  };
}

function send(session: Session, command: string): string {
  expect(session.input()).toEqual({ type: 'line', maxlen: expect.any(Number) });
  session.engine.sendLine(command);
  return session.take();
}

describe('ZVM adapter', () => {
  it('starts with a key prompt, then plays the fixture to the winning ending', async () => {
    const s = await start();
    expect(s.errors).toEqual([]);
    expect(s.take()).toContain('[Press any key to begin.]');
    expect(s.input()).toEqual({ type: 'char' });

    s.engine.sendChar(' ');
    const intro = s.take();
    expect(intro).toContain('Someone has to light the lamp.');
    expect(intro).toContain('THE LAMP AT SALTMERE');
    expect(intro).toContain('Landing Stage');
    expect(s.input()).toMatchObject({ type: 'line' });

    expect(send(s, 'look')).toContain('A stone jetty at the foot of the lighthouse.');
    expect(send(s, 'take can')).toContain('Taken.');
    expect(send(s, 'north')).toContain('Foot of the Tower');
    expect(send(s, 'up')).toContain('Lamp Room');
    expect(send(s, 'light lamp')).toContain('The reservoir is dry');
    expect(send(s, 'fill lamp')).toContain('You pour the paraffin into the reservoir.');
    expect(send(s, 'light lamp')).toContain('You have nothing to light it with.');
    expect(send(s, 'down')).toContain('Foot of the Tower');
    expect(send(s, 'south')).toContain('Landing Stage');
    expect(send(s, 'open shed')).toContain('You open the shed.');
    expect(send(s, 'east')).toContain('Inside the Shed');
    expect(send(s, 'take matches')).toContain('Taken.');
    send(s, 'west');
    send(s, 'north');
    send(s, 'up');
    const ending = send(s, 'light lamp');
    expect(ending).toContain('the beam sweeps out over the sea');
    expect(ending).toContain('You have won');
    expect(ending).toMatch(/scored 3 out of a possible 3/);
    expect(s.errors).toEqual([]);
  });

  it('echoes commands after the prompt as input', async () => {
    const s = await start();
    s.engine.sendChar('return');
    s.engine.sendLine('look');
    const echoed = s.transcript().paragraphs.filter((p) => p.input);
    expect(echoed.map((p) => p.text)).toEqual(['>look']);
    const runs = echoed[0].runs;
    expect(runs[runs.length - 1]).toEqual({ text: 'look', style: 'input' });
  });

  it('extracts the status line: location, score and turns', async () => {
    const s = await start();
    s.engine.sendChar(' ');
    let status = splitStatus(s.transcript().status);
    expect(status.left).toBe('Landing Stage');
    expect(status.right).toMatch(/^Score: 0\s+Moves: 0$/);
    expect(s.transcript().status[0]).toHaveLength(80);

    s.engine.sendLine('take can');
    s.engine.sendLine('north');
    status = splitStatus(s.transcript().status);
    expect(status.left).toBe('Foot of the Tower');
    expect(status.right).toMatch(/^Score: 1\s+Moves: 2$/);
  });

  it('ignores input that was not asked for', async () => {
    const s = await start();
    s.engine.sendLine('look'); // a key is expected, not a line
    expect(s.input()).toEqual({ type: 'char' });
    expect(s.transcript().paragraphs.some((p) => p.input)).toBe(false);
  });

  it('runs two games side by side without sharing state', async () => {
    const a = await start();
    const b = await start();
    a.engine.sendChar(' ');
    b.engine.sendChar(' ');
    a.engine.sendLine('take can');
    expect(splitStatus(a.transcript().status).right).toMatch(/Score: 1/);
    expect(splitStatus(b.transcript().status).right).toMatch(/Score: 0/);
    expect(send(b, 'inventory')).toContain("You're carrying nothing.");
  });

  it('rejects a story that is not Z-code', async () => {
    const engine = createZvmEngine();
    await expect(engine.load(new ArrayBuffer(64), {})).rejects.toThrow(/not a Z-Code file/);
  });

  it('saves between turns and restores into the same game or a fresh engine', async () => {
    const s = await start();
    s.engine.sendChar(' ');
    await expect(s.engine.saveState()).resolves.toBeInstanceOf(Uint8Array);
    send(s, 'take can');
    send(s, 'north');
    const state = await s.engine.saveState();
    s.take();

    // Play on, then go back: the paraffin can is carried again and the lamp still dry.
    send(s, 'up');
    send(s, 'fill lamp');
    const before = s.transcript().paragraphs.length;
    await s.engine.restoreState(state);
    // No text replayed: the reader keeps its own transcript.
    expect(s.transcript().paragraphs).toHaveLength(before);
    expect(splitStatus(s.transcript().status).left).toBe('Foot of the Tower');
    expect(s.input()).toMatchObject({ type: 'line' });
    expect(send(s, 'inventory')).toContain('paraffin');

    // Another engine (a page reload) resumes from the same bytes.
    const t = await start();
    await t.engine.restoreState(state);
    t.take();
    expect(splitStatus(t.transcript().status).right).toMatch(/Score: 1\s+Moves: 2$/);
    expect(send(t, 'up')).toContain('Lamp Room');
    expect(send(t, 'fill lamp')).toContain('You pour the paraffin');
    expect(s.errors).toEqual([]);
    expect(t.errors).toEqual([]);
  });

  it('refuses to save while a key is expected', async () => {
    const s = await start();
    await expect(s.engine.saveState()).rejects.toThrow(/between turns/);
  });

  it('rejects data that is not a state of this story, and keeps playing', async () => {
    const s = await start();
    s.engine.sendChar(' ');
    send(s, 'take can');
    await expect(s.engine.restoreState(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /Not a saved game/,
    );
    const state = await s.engine.saveState();
    const other = JSON.parse(new TextDecoder().decode(state));
    other.signature = '00' + other.signature.slice(2);
    await expect(
      s.engine.restoreState(new TextEncoder().encode(JSON.stringify(other))),
    ).rejects.toThrow(/another story/);
    expect(send(s, 'inventory')).toContain('paraffin');
  });

  it('restarts from the beginning', async () => {
    const s = await start();
    s.engine.sendChar(' ');
    send(s, 'take can');
    s.take();
    await s.engine.restart();
    expect(s.take()).toContain('[Press any key to begin.]');
    s.engine.sendChar(' ');
    expect(send(s, 'inventory')).toContain("You're carrying nothing.");
  });

  it('leaves undo to the reader', async () => {
    const s = await start();
    await expect(s.engine.undo()).resolves.toBe(false);
  });
});
