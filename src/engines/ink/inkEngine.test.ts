// @vitest-environment node
// Headless adapter test: the fixture ink story played through inkjs, no DOM.
import { readFileSync } from 'node:fs';
import { strToU8 } from 'fflate';
import { Compiler } from 'inkjs/full';
import { describe, expect, it } from 'vitest';
import type { Engine, InputRequest } from '../engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../transcript';
import { createInkEngine } from './inkEngine';

const STORY = readFileSync('tests/fixtures/ink/lamp.json');

interface Session {
  engine: Engine;
  transcript(): Transcript;
  input(): InputRequest | null;
  exited(): boolean;
  errors: string[];
  /** Text output since the last call. */
  take(): string;
}

function listen(engine: Engine): Session {
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
  return {
    engine,
    transcript: () => transcript,
    input: () => request,
    exited: () => exited,
    errors,
    take() {
      const paragraphs = transcript.paragraphs;
      const from = read;
      read = paragraphs.length;
      return paragraphs
        .slice(from)
        .map((p) => p.text)
        .join('\n');
    },
  };
}

async function start(story: ArrayBuffer | string = storyBuffer()): Promise<Session> {
  const engine = createInkEngine();
  const session = listen(engine);
  await engine.load(story, {});
  return session;
}

function storyBuffer(): ArrayBuffer {
  return STORY.buffer.slice(STORY.byteOffset, STORY.byteOffset + STORY.byteLength) as ArrayBuffer;
}

/** Picks the choice labelled `label` and returns the text that follows. */
function pick(session: Session, label: string): string {
  const request = session.input();
  if (!request || request.type !== 'choice') throw new Error('No choice asked for');
  const index = request.choices.indexOf(label);
  expect(index, label + ' in ' + request.choices.join(' | ')).toBeGreaterThanOrEqual(0);
  session.engine.choose(index);
  return session.take();
}

describe('ink adapter', () => {
  it('offers choices and plays the fixture to its ending', async () => {
    const s = await start();
    expect(s.errors).toEqual([]);
    expect(s.take()).toContain('The ferry leaves you on the landing stage of Saltmere.');
    expect(s.input()).toEqual({
      type: 'choice',
      choices: ['Take the paraffin can', 'Walk up to the lighthouse'],
    });

    expect(pick(s, 'Take the paraffin can')).toContain('You pick up the paraffin can.');
    expect(s.input()).toEqual({ type: 'choice', choices: ['Climb the stair', 'Wait for morning'] });
    expect(pick(s, 'Climb the stair')).toContain('its reservoir dry');
    expect(pick(s, 'Fill the lamp')).toContain('You pour the paraffin into the reservoir.');
    const ending = pick(s, 'Light the lamp');
    expect(ending).toContain('the beam sweeps out over the water');
    expect(ending).toContain('THE END: you have lit the lamp.');
    expect(s.exited()).toBe(true);
    expect(s.input()).toBeNull();
    expect(s.errors).toEqual([]);
  });

  it('echoes the choice made as input', async () => {
    const s = await start();
    pick(s, 'Walk up to the lighthouse');
    const echoed = s.transcript().paragraphs.filter((p) => p.input);
    expect(echoed.map((p) => p.runs)).toEqual([
      [{ text: 'Walk up to the lighthouse', style: 'input' }],
    ]);
  });

  it('puts the title and chapter tags in the status line', async () => {
    const s = await start();
    let status = splitStatus(s.transcript().status);
    expect(status).toEqual({ left: 'The Lamp at Saltmere', right: 'The Landing Stage' });
    pick(s, 'Walk up to the lighthouse');
    status = splitStatus(s.transcript().status);
    expect(status).toEqual({ left: 'The Lamp at Saltmere', right: 'Foot of the Tower' });
  });

  it('shows the chapter alone when the story has no title tag', async () => {
    const json = JSON.parse(STORY.toString('utf8').replace(/^\uFEFF/, '')) as {
      root: unknown[];
    };
    const text = JSON.stringify(json).replace('"^title: The Lamp at Saltmere",', '');
    const s = await start(text);
    expect(s.transcript().status).toEqual(['The Landing Stage']);
  });

  it('ignores typed commands, keys and choices out of range', async () => {
    const s = await start();
    s.take();
    s.engine.sendLine('take can');
    s.engine.sendChar('return');
    s.engine.choose(5);
    s.engine.choose(-1);
    expect(s.take()).toBe('');
    expect(s.input()).toMatchObject({ type: 'choice' });
  });

  it('saves between choices and restores that state', async () => {
    const s = await start();
    pick(s, 'Take the paraffin can');
    const saved = await s.engine.saveState();
    pick(s, 'Wait for morning');
    expect(s.exited()).toBe(true);
    await expect(s.engine.saveState()).rejects.toThrow();

    // Back at the foot of the tower, can in hand: the text is not replayed, the choices are asked for again.
    await s.engine.restoreState(saved);
    expect(s.take()).toBe('');
    expect(s.input()).toEqual({ type: 'choice', choices: ['Climb the stair', 'Wait for morning'] });
    expect(pick(s, 'Climb the stair')).toContain('The great lamp');
    expect(s.input()).toMatchObject({ choices: ['Fill the lamp', 'Go back down'] });
  });

  it('restores a state in a new engine (resume after a reload), status line included', async () => {
    const a = await start();
    pick(a, 'Walk up to the lighthouse');
    pick(a, 'Climb the stair');
    const saved = await a.engine.saveState();

    const b = await start();
    await b.engine.restoreState(saved);
    expect(b.input()).toEqual({ type: 'choice', choices: ['Go back down'] });
    pick(b, 'Go back down');
    expect(splitStatus(b.transcript().status).right).toBe('Foot of the Tower');
    // The can was never taken in that story: the choice to fetch it is there.
    expect(b.input()).toMatchObject({
      choices: ['Go back for the paraffin can', 'Climb the stair', 'Wait for morning'],
    });
  });

  it('refuses a state that is not a save of this story, and plays on', async () => {
    const s = await start();
    await expect(s.engine.restoreState(strToU8('not json'))).rejects.toThrow();
    await expect(
      s.engine.restoreState(strToU8(JSON.stringify({ format: 'inkventure-quixe', version: 1 }))),
    ).rejects.toThrow();
    const saved = JSON.parse(new TextDecoder().decode(await s.engine.saveState())) as {
      signature: string;
    };
    saved.signature = 'other';
    await expect(s.engine.restoreState(strToU8(JSON.stringify(saved)))).rejects.toThrow(
      /another story/,
    );
    expect(pick(s, 'Take the paraffin can')).toContain('You pick up the paraffin can.');
  });

  it('restarts from the beginning', async () => {
    const s = await start();
    pick(s, 'Take the paraffin can');
    pick(s, 'Climb the stair');
    await s.engine.restart();
    expect(s.take()).toContain('The ferry leaves you on the landing stage');
    expect(splitStatus(s.transcript().status).right).toBe('The Landing Stage');
    expect(s.input()).toMatchObject({
      choices: ['Take the paraffin can', 'Walk up to the lighthouse'],
    });
  });

  it('leaves undo to the reader', async () => {
    const s = await start();
    expect(await s.engine.undo()).toBe(false);
  });

  it('rejects a file that is not an ink story', async () => {
    await expect(createInkEngine().load('<!DOCTYPE html>', {})).rejects.toThrow();
  });

  it('reports a runtime error of the story', async () => {
    const compiled = new Compiler('EXTERNAL missing()\nBefore.\n~ missing()\nAfter.\n').Compile();
    const s = await start(compiled.ToJson() as string);
    expect(s.errors.length).toBe(1);
    expect(s.errors[0]).toMatch(/missing/);
    expect(s.input()).toBeNull();
  });
});
