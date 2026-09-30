// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Engine, InputRequest, TextRun } from '../engines/engine';
import { applyOutput, EMPTY_TRANSCRIPT, splitStatus, type Transcript } from '../engines/transcript';
import { createZvmEngine } from '../engines/zvm/zvmEngine';
import { MemoryBackend } from './backend';
import { keys, PREFIX } from './keys';
import {
  clearAutosave,
  listSlots,
  readAutosave,
  readProgress,
  readSlot,
  SLOT_COUNT,
  TAIL_CHARS,
  transcriptTail,
  updateProgress,
  writeAutosave,
  writeSlot,
  type GameSnapshot,
} from './saves';
import { createStore, isStorageFullError } from './store';

const STORY = readFileSync('tests/fixtures/zmachine/lamp.z5');
const TUID = 'lamp';

async function play(commands: string[]) {
  const engine: Engine = createZvmEngine();
  let transcript: Transcript = EMPTY_TRANSCRIPT;
  let request: InputRequest | null = null;
  engine.onOutput((blocks) => {
    transcript = applyOutput(transcript, blocks);
  });
  engine.onInputRequest((req) => {
    request = req;
  });
  await engine.load(STORY.buffer.slice(STORY.byteOffset, STORY.byteOffset + STORY.byteLength), {});
  engine.sendChar(' ');
  for (const command of commands) engine.sendLine(command);
  return { engine, transcript: () => transcript, input: () => request };
}

function snapshotOf(state: Uint8Array, turn: number, transcript: Transcript): GameSnapshot {
  return {
    state,
    turn,
    paragraphs: transcript.paragraphs.map((p) => p.runs),
    status: transcript.status,
  };
}

function fake(turn: number, size = 10): GameSnapshot {
  return {
    state: new Uint8Array(size).fill(turn),
    turn,
    paragraphs: [[{ text: 'Turn ' + turn, style: 'normal' }]],
    status: ['Somewhere'],
  };
}

describe('game saves', () => {
  it('round-trips a Z-machine game through storage (autosave and a slot)', async () => {
    const store = createStore(new MemoryBackend());
    const game = await play(['take can', 'north']);
    const state = await game.engine.saveState();
    writeAutosave(store, TUID, snapshotOf(state, 2, game.transcript()), 1000);
    writeSlot(store, TUID, 3, 'Tower', snapshotOf(state, 2, game.transcript()), 2000);

    // Stored compressed: much smaller than the raw state.
    const raw = new MemoryBackend();
    const rawStore = createStore(raw);
    writeAutosave(rawStore, TUID, snapshotOf(state, 2, game.transcript()), 1000);
    expect(raw.getItem(PREFIX + keys.autosave(TUID))!.length).toBeLessThan(state.length / 2);

    for (const saved of [readAutosave(store, TUID), readSlot(store, TUID, 3)]) {
      expect(saved).toBeDefined();
      expect(saved!.turn).toBe(2);
      expect(saved!.state).toEqual(state);
      expect(saved!.paragraphs).toEqual(game.transcript().paragraphs.map((p) => p.runs));
      expect(splitStatus(saved!.status).left).toBe('Foot of the Tower');

      // A fresh engine (a reload) continues from it.
      const other = await play([]);
      await other.engine.restoreState(saved!.state);
      other.engine.sendLine('up');
      expect(
        other
          .transcript()
          .paragraphs.map((p) => p.text)
          .join('\n'),
      ).toContain('Lamp Room');
    }
  });

  it('lists the named slots, empty ones as null', () => {
    const store = createStore(new MemoryBackend());
    writeSlot(store, TUID, 2, 'Before the storm', fake(7), 5000);
    writeSlot(store, TUID, 5, '', fake(9), 6000);
    writeAutosave(store, TUID, fake(10), 7000);
    writeSlot(store, 'other', 1, 'Elsewhere', fake(1), 1000);
    expect(listSlots(store, TUID)).toEqual([
      null,
      { slot: 2, name: 'Before the storm', date: 5000, turn: 7 },
      null,
      null,
      { slot: 5, name: '', date: 6000, turn: 9 },
    ]);
    expect(listSlots(store, TUID)).toHaveLength(SLOT_COUNT);
    expect(() => writeSlot(store, TUID, 6, 'x', fake(1), 0)).toThrow();
    expect(() => writeSlot(store, TUID, 0, 'x', fake(1), 0)).toThrow();

    // Overwriting a slot replaces it.
    writeSlot(store, TUID, 2, 'After the storm', fake(8), 8000);
    expect(listSlots(store, TUID)[1]).toEqual({
      slot: 2,
      name: 'After the storm',
      date: 8000,
      turn: 8,
    });
    expect(readSlot(store, TUID, 2)!.state).toEqual(fake(8).state);
  });

  it('clears the autosave and ignores unreadable records', () => {
    const backend = new MemoryBackend();
    const store = createStore(backend);
    writeAutosave(store, TUID, fake(3), 0);
    clearAutosave(store, TUID);
    expect(readAutosave(store, TUID)).toBeUndefined();
    backend.setItem(
      PREFIX + keys.save(TUID, '1'),
      JSON.stringify({ v: 1, data: '!!', text: '!!', turn: 1 }),
    );
    expect(readSlot(store, TUID, 1)).toBeUndefined();
    backend.setItem(PREFIX + keys.save(TUID, '2'), '{"hello":1}');
    expect(listSlots(store, TUID)[1]).toBeNull();
  });

  it('keeps previous saves intact when the storage is full', () => {
    // Room for the first saves, not for a much larger one.
    const backend = new MemoryBackend(2000);
    const store = createStore(backend);
    writeSlot(store, TUID, 1, 'First', fake(1), 0);
    writeAutosave(store, TUID, fake(2), 0);
    const random = new Uint8Array(4000);
    // Incompressible (xorshift) bytes.
    let seed = 2463534242;
    for (let i = 0; i < random.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      random[i] = seed & 0xff;
    }
    const big = { ...fake(3), state: random };

    let error: unknown;
    try {
      writeSlot(store, TUID, 1, 'Second', big, 0);
    } catch (e) {
      error = e;
    }
    expect(isStorageFullError(error)).toBe(true);
    expect(() => writeAutosave(store, TUID, big, 0)).toThrow();
    expect(readSlot(store, TUID, 1)).toEqual(fake(1));
    expect(listSlots(store, TUID)[0]!.name).toBe('First');
    expect(readAutosave(store, TUID)).toEqual(fake(2));
  });

  it('keeps a transcript tail: whole last paragraphs up to the character budget', () => {
    const paragraph = (n: number, length: number): TextRun[] => [
      { text: String(n).padEnd(length, '.'), style: 'normal' },
    ];
    const many = [];
    for (let i = 0; i < 300; i++) many.push(paragraph(i, 100));
    const tail = transcriptTail(many);
    expect(tail[tail.length - 1]).toBe(many[299]);
    expect(tail.length).toBe(TAIL_CHARS / 100);
    // A single paragraph longer than the budget is still kept.
    expect(transcriptTail([paragraph(1, 10), paragraph(2, TAIL_CHARS * 2)])).toHaveLength(1);
    expect(transcriptTail([])).toEqual([]);
  });

  it('updates the progress record, keeping the per-game reader settings', () => {
    const store = createStore(new MemoryBackend());
    store.set(keys.progress(TUID), { reader: { size: 3 } });
    updateProgress(store, TUID, { turns: 4, lastPlayed: 123, location: 'Lamp Room' });
    expect(readProgress(store, TUID)).toEqual({
      reader: { size: 3 },
      turns: 4,
      lastPlayed: 123,
      location: 'Lamp Room',
    });
    updateProgress(store, TUID, { turns: 5, lastPlayed: 456, location: '' });
    expect(readProgress(store, TUID)).toEqual({ reader: { size: 3 }, turns: 5, lastPlayed: 456 });
  });
});
