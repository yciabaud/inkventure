import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRuntime, probeFiles } from './bitsy-probe';
import { BITSY_BASE, BITSY_ENGINE, BITSY_FILES, ensureBitsy } from './bitsy-files';
import { headlessBitsy, KEY, startGame, type HeadlessBitsy } from './bitsy-headless';
import { sha256 } from './quixe-files';

const game = readFileSync('public/probe/bitsy/keepers-lamp.bitsy', 'utf8');

function started() {
  return startGame(game);
}

function press(run: HeadlessBitsy, code: number) {
  return run.press(code);
}

describe('the Bitsy runtime with the e-ink system layer', () => {
  it('starts the game on its title, then stops ticking', () => {
    const run = started();
    expect(run.ik.dialog).toBe(true);
    expect(run.ik.roomName).toBe('shore');
    expect(run.ik.draws).toBeGreaterThan(0);
    expect(run.ik.awake).toBe(0);
    expect(run.frames).toHaveLength(0);
  });

  it('draws nothing on a tick that changes nothing', () => {
    const run = started();
    press(run, KEY.SPACE); // close the title
    expect(run.ik.dialog).toBe(false);
    const ops = run.ops.count;
    const draws = run.ik.draws;
    run.ik.wake(); // ticks with no input
    expect(run.flush()).toBe(2);
    expect(run.ops.count).toBe(ops);
    expect(run.ik.draws).toBe(draws);
  });

  it('moves the avatar one tile per press of the pad, and draws it', () => {
    const run = started();
    press(run, KEY.SPACE);
    const ops = run.ops.count;
    expect(run.ik.player()).toEqual({ room: '0', x: 3, y: 7 });
    press(run, KEY.RIGHT);
    expect(run.ik.player()).toEqual({ room: '0', x: 4, y: 7 });
    expect(run.ops.count).toBeGreaterThan(ops);
    expect(run.ik.awake).toBe(0);
  });

  it('a press between two ticks is still read (latched)', () => {
    const run = started();
    press(run, KEY.SPACE);
    run.ik.press(KEY.UP);
    run.ik.release(KEY.UP); // released before any tick ran
    run.flush();
    expect(run.ik.player()).toEqual({ room: '0', x: 3, y: 6 });
  });

  it('shows a dialogue page at once, and a tap reads on', () => {
    const run = started();
    run.ik.tap();
    run.flush();
    // Walk to the gull (7,4): up 3, right 4 (the last step bumps into it).
    for (let i = 0; i < 3; i++) press(run, KEY.UP);
    for (let i = 0; i < 4; i++) press(run, KEY.RIGHT);
    expect(run.ik.dialog).toBe(true);
    // The page is whole: the loop stopped with the page ready, not one character at a time.
    expect(run.ik.awake).toBe(0);
    let pages = 0;
    while (run.ik.dialog && pages < 10) {
      run.ik.tap();
      run.flush();
      pages++;
    }
    expect(pages).toBeGreaterThan(1);
    expect(run.ik.dialog).toBe(false);
  });

  it('goes through an exit with a transition effect straight to the next room', () => {
    const run = started();
    press(run, KEY.SPACE);
    // From (3,7) to the exit at (15,7).
    for (let i = 0; i < 12; i++) press(run, KEY.RIGHT);
    expect(run.ik.player()).toMatchObject({ room: '1', x: 1, y: 7 });
    expect(run.ik.roomName).toBe('path');
    expect(run.ik.awake).toBe(0);
  });
});

describe('grayPalette', () => {
  const { ik } = headlessBitsy();
  // Index 0: background (the room's first colour), 1–3: text, then the room's three colours at 16.
  function block(room: number[][]) {
    const palette = new Array(64 * 3).fill(0);
    const set = (i: number, c: number[]) => palette.splice(i * 3, 3, ...c);
    set(0, room[0]);
    set(1, [0, 0, 0]);
    set(3, [255, 255, 255]);
    room.forEach((c, i) => set(16 + i, c));
    return palette;
  }
  const blue = [
    [0, 82, 204],
    [128, 159, 255],
    [255, 255, 255],
  ];

  it('stretches the room colours from black to white, by luminance', () => {
    const grays = ik.grayPalette(block(blue), 'stretch', 16, 3, 0);
    expect(grays.slice(48, 57)).toEqual([0, 0, 0, 125, 125, 125, 255, 255, 255]);
    expect(grays.slice(0, 3)).toEqual([0, 0, 0]); // background = first room colour
    expect(grays.slice(9, 12)).toEqual([255, 255, 255]); // text stays white
    expect(ik.roomContrast(grays, 16, 3)).toBe(125);
  });

  it('keeps plain luminance, or the colours', () => {
    const lum = ik.grayPalette(block(blue), 'lum', 16, 3, 0);
    expect(lum.slice(48, 51)).toEqual([71, 71, 71]);
    expect(ik.grayPalette(block(blue), 'off', 16, 3, 0).slice(48, 51)).toEqual([0, 82, 204]);
  });

  it('leaves a one-colour room alone', () => {
    const grays = ik.grayPalette(block([[90, 90, 90]]), 'stretch', 16, 1, 0);
    expect(grays.slice(48, 51)).toEqual([90, 90, 90]);
  });
});

describe('buildRuntime', () => {
  it('keeps the export order: our input and sound, graphics, system, the engine, then eink.js', () => {
    const runtime = buildRuntime(
      (name) => `/*${name}*/`,
      (name) => `/*eink:${name}*/`,
    );
    const order = [
      'eink:input.js',
      'eink:sound.js',
      'graphics.js',
      'system.js',
      ...BITSY_ENGINE,
      'eink:eink.js',
    ].map((name) => runtime.indexOf(`/*${name}*/`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is the pinned engine, unchanged, and parses', () => {
    const runtime = probeFiles()['probe/bitsy/runtime.js'];
    expect(runtime).toMatch(/^\/\* Bitsy 8\.14 \(commit 2f5eecf8\)/);
    expect(runtime).toContain(readFileSync('vendor/bitsy/bitsy.js', 'utf8'));
    expect(runtime).not.toContain('new AudioContext()');
    expect(() => new Function(runtime)).not.toThrow();
  });
});

// Stand-in contents: the test checks the flow with hashes computed here, not the real files.
function fakeFiles() {
  const contents: Record<string, Uint8Array> = {};
  for (const file of BITSY_FILES) contents[file.name] = new TextEncoder().encode('// ' + file.name);
  const files = BITSY_FILES.map((file) => ({ ...file, sha256: sha256(contents[file.name]) }));
  return { contents, files };
}

describe('ensureBitsy', () => {
  it('downloads each missing file from the pinned commit and keeps the ones already checked', async () => {
    const { contents, files } = fakeFiles();
    const written: Record<string, Uint8Array> = { 'bitsy.js': contents['bitsy.js'] };
    const urls: string[] = [];
    const downloaded = await ensureBitsy(
      {
        read: (name) => written[name],
        download: async (url) => {
          urls.push(url);
          return contents[files.find((f) => BITSY_BASE + f.path === url)!.name];
        },
        write: (name, data) => (written[name] = data),
      },
      files,
    );
    expect(downloaded).not.toContain('bitsy.js');
    expect(downloaded).toHaveLength(files.length - 1);
    expect(urls[0]).toBe(BITSY_BASE + 'editor/script/system/system.js');
  });

  it('fails loudly when a file does not match its hash', async () => {
    const { files } = fakeFiles();
    await expect(
      ensureBitsy(
        {
          read: () => undefined,
          download: async () => new TextEncoder().encode('changed upstream'),
          write: () => {},
        },
        files,
      ),
    ).rejects.toThrow(/SHA-256 [0-9a-f]{64}, expected/);
  });

  it('pins every file the runtime and the page need', () => {
    const names = BITSY_FILES.map((file) => file.name);
    for (const name of [...BITSY_ENGINE, 'system.js', 'graphics.js', 'ascii_small.bitsyfont'])
      expect(names).toContain(name);
    for (const file of BITSY_FILES) {
      expect(sha256(readFileSync('vendor/bitsy/' + file.name)), file.name).toBe(file.sha256);
    }
  });
});
