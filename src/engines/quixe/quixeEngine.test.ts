// @vitest-environment node
// Headless adapter test: the Glulx fixture game played through Quixe, its Glk library and our GlkOte bridge, no DOM.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Engine, InputRequest } from '../engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../transcript';
import { createQuixeEngine } from './quixeEngine';

const STORY = readFileSync('tests/fixtures/glulx/lamp.ulx');
/** Opens a graphics window and plays a sound without checking that Glk supports them. */
const MEDIA = readFileSync('tests/fixtures/glulx/media.ulx');
/** An illustrated game: a Blorb with one PNG picture and its alt text. */
const PICTURE = readFileSync('tests/fixtures/glulx/picture.gblorb');

function copy(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** A minimal Blorb (IFRS) holding `game` as its Glulx executable. */
function blorb(game: Uint8Array): Uint8Array {
  const pad = game.length % 2;
  const ridx = 4 + 12;
  const total = 4 + (8 + ridx) + (8 + game.length + pad);
  const out = new Uint8Array(8 + total);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'FORM');
  view.setUint32(4, total);
  text(8, 'IFRS');
  text(12, 'RIdx');
  view.setUint32(16, ridx);
  view.setUint32(20, 1);
  text(24, 'Exec');
  view.setUint32(28, 0);
  const execAt = 12 + 8 + ridx;
  view.setUint32(32, execAt);
  text(execAt, 'GLUL');
  view.setUint32(execAt + 4, game.length);
  out.set(game, execAt + 8);
  return out;
}

interface Session {
  engine: Engine;
  transcript(): Transcript;
  input(): InputRequest | null;
  exited(): boolean;
  errors: string[];
  /** Resolves at the next input request (or the end of the story). */
  next(): Promise<void>;
  /** Text output since the last call. */
  take(): string;
}

async function start(
  story: Uint8Array = STORY,
  options: { sliceMs?: number } = {},
): Promise<Session> {
  const engine = createQuixeEngine(options);
  let transcript = EMPTY_TRANSCRIPT;
  let request: InputRequest | null = null;
  let exited = false;
  let read = 0;
  let waiters: Array<() => void> = [];
  const wake = () => {
    const current = waiters;
    waiters = [];
    current.forEach((fn) => fn());
  };
  const errors: string[] = [];
  engine.onOutput((blocks) => {
    transcript = applyOutput(transcript, blocks);
  });
  engine.onInputRequest((req) => {
    request = req;
    wake();
  });
  engine.onExit(() => {
    exited = true;
    request = null;
    wake();
  });
  engine.onError((message) => {
    errors.push(message);
    wake();
  });
  await engine.load(copy(story), { columns: 80 });
  return {
    engine,
    transcript: () => transcript,
    input: () => request,
    exited: () => exited,
    errors,
    next: () => new Promise<void>((resolve) => waiters.push(resolve)),
    take() {
      const paragraphs = transcript.paragraphs;
      const from = Math.max(read - 1, 0);
      read = paragraphs.length;
      return paragraphs
        .slice(from)
        .map((p) => p.text)
        .join('\n');
    },
  };
}

async function send(session: Session, command: string): Promise<string> {
  const next = session.next();
  session.engine.sendLine(command);
  await next;
  return session.take();
}

async function begin(session: Session) {
  expect(session.input()).toEqual({ type: 'char' });
  const next = session.next();
  session.engine.sendChar(' ');
  await next;
  session.take();
}

describe('Quixe engine', () => {
  it('plays the fixture to its ending, with the status line', async () => {
    const session = await start();
    expect(session.take()).toContain('[Press any key to begin.]');
    await begin(session);
    expect(session.input()).toEqual({ type: 'line', maxlen: expect.any(Number) });
    expect(splitStatus(session.transcript().status).left).toBe('Landing Stage');

    expect(await send(session, 'take can')).toContain('Taken.');
    expect(await send(session, 'north')).toContain('Foot of the Tower');
    expect(splitStatus(session.transcript().status).right).toMatch(/Moves: 2/);
    await send(session, 'south');
    await send(session, 'east');
    await send(session, 'open shed');
    await send(session, 'take matches');
    await send(session, 'west');
    await send(session, 'north');
    await send(session, 'up');
    expect(await send(session, 'fill lamp')).toContain('You pour the paraffin into the reservoir.');
    const ending = await send(session, 'light lamp');
    expect(ending).toMatch(/won/i);
    expect(session.errors).toEqual([]);
  });

  it('plays a Blorb (gblorb) the same way', async () => {
    const session = await start(blorb(new Uint8Array(STORY)));
    await begin(session);
    expect(await send(session, 'take can')).toContain('Taken.');
  });

  it('runs a game that draws pictures and plays sounds without checking support', async () => {
    const session = await start(MEDIA);
    expect(session.errors).toEqual([]);
    expect(session.take()).toContain('Pictures and sounds are ready.');
    expect(session.input()).toEqual({ type: 'line', maxlen: expect.any(Number) });
    const next = session.next();
    session.engine.sendLine('go');
    await next;
    expect(session.take()).toContain('The end.');
    expect(session.exited()).toBe(true);
    expect(session.errors).toEqual([]);
  });

  it('shows the pictures of a Blorb as image blocks, and gives their data', async () => {
    const session = await start(PICTURE);
    expect(session.errors).toEqual([]);
    const paragraphs = session.transcript().paragraphs;
    const at = paragraphs.findIndex((p) => p.image);
    expect(paragraphs[at].image).toEqual({
      image: 1,
      width: 600,
      height: 400,
      alt: 'A painting of a lighthouse at dusk, its lamp lit above a dark sea.',
    });
    expect(paragraphs[at - 1].text).toBe('You step closer to look at it.');
    expect(paragraphs[at + 1].text).toMatch(/^It shows the lighthouse/);
    const url = session.engine.imageUrl!(1);
    expect(url).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    expect(session.engine.imageUrl!(2)).toBe(null);
    expect(await send(session, 'look')).toContain('You look at the painting a little longer (1).');
  });

  it('yields to the event loop during a long run when sliced', async () => {
    // A tiny slice yields every 256 paths: the start cannot finish synchronously.
    let loaded = false;
    const engine = createQuixeEngine({ sliceMs: 0.000001 });
    const load = engine.load(copy(STORY), {}).then(() => (loaded = true));
    await Promise.resolve();
    expect(loaded).toBe(false);
    await load;
    expect(loaded).toBe(true);
  });

  it('saves and restores between turns, in a fresh engine too', async () => {
    const session = await start();
    await begin(session);
    await send(session, 'take can');
    await send(session, 'north');
    const state = await session.engine.saveState();
    // Compact: the RAM is stored as a delta against the story.
    expect(state.length).toBeLessThan(STORY.length);

    await send(session, 'up');
    expect(splitStatus(session.transcript().status).left).toBe('Lamp Room');
    await session.engine.restoreState(state);
    expect(session.input()).toEqual({ type: 'line', maxlen: expect.any(Number) });
    expect(splitStatus(session.transcript().status).left).toBe('Foot of the Tower');
    session.take();
    expect(await send(session, 'inventory')).toContain('paraffin can');

    const other = await start();
    await other.engine.restoreState(state);
    other.take();
    expect(await send(other, 'up')).toContain('Lamp Room');
    expect(await send(other, 'fill lamp')).toContain('You pour the paraffin into the reservoir.');
    expect(other.errors).toEqual([]);
  });

  it('keeps the state of a game with a large RAM small (deflated delta), and restores it', async () => {
    // The fixture with 1.5 MB more RAM (endmem), the size of a medium Inform 7 game's.
    const big = new Uint8Array(STORY);
    const header = new DataView(big.buffer, big.byteOffset);
    header.setUint32(16, header.getUint32(16) + 1536 * 1024);
    const session = await start(big);
    await begin(session);
    await send(session, 'take can');
    const state = await session.engine.saveState();
    expect(state.length).toBeLessThan(32 * 1024);
    await send(session, 'north');
    await session.engine.restoreState(state);
    session.take();
    expect(await send(session, 'look')).toContain('Landing Stage');
    expect(await send(session, 'inventory')).toContain('paraffin can');
  });

  it('still restores a version 1 state (the RAM delta not deflated)', async () => {
    const session = await start();
    await begin(session);
    await send(session, 'take can');
    const v2 = JSON.parse(new TextDecoder().decode(await session.engine.saveState()));
    const delta = inflateSync(Buffer.from(v2.snapshot.ramz, 'base64'));
    const v1 = {
      ...v2,
      version: 1,
      snapshot: { ...v2.snapshot, ramz: undefined, ramx: Buffer.from(delta).toString('base64') },
    };
    await send(session, 'north');
    await session.engine.restoreState(new TextEncoder().encode(JSON.stringify(v1)));
    session.take();
    expect(await send(session, 'look')).toContain('Landing Stage');
    expect(await send(session, 'inventory')).toContain('paraffin can');
  });

  it('snapshots the very first prompt, before any command', async () => {
    const session = await start();
    await begin(session);
    const first = await session.engine.saveState();
    await send(session, 'take can');
    await session.engine.restoreState(first);
    session.take();
    expect(await send(session, 'inventory')).toMatch(/empty-handed|carrying nothing/i);
  });

  it('refuses a state of another story or garbage, and keeps playing', async () => {
    const session = await start();
    await begin(session);
    const state = JSON.parse(new TextDecoder().decode(await session.engine.saveState()));
    state.signature = '00';
    await expect(
      session.engine.restoreState(new TextEncoder().encode(JSON.stringify(state))),
    ).rejects.toThrow(/another story/);
    await expect(session.engine.restoreState(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(await send(session, 'take can')).toContain('Taken.');
  });

  it('cannot save while a key is expected', async () => {
    const session = await start();
    await expect(session.engine.saveState()).rejects.toThrow();
  });

  it('restarts from the beginning', async () => {
    const session = await start();
    await begin(session);
    await send(session, 'take can');
    await session.engine.restart();
    expect(session.input()).toEqual({ type: 'char' });
  });

  it('rejects a file that is not a Glulx game', async () => {
    const engine = createQuixeEngine();
    await expect(engine.load(new ArrayBuffer(64), {})).rejects.toThrow();
  });
});
