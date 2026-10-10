// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { patchDecker } from './decker-probe';
import { APP_PATCHES, appRuntimeFiles, buildAppRuntime, SYNC } from './decker-runtime';

// The pinned upstream files, downloaded at install (scripts/build/fetch-decker.ts).
const upstream = readFileSync('vendor/decker/decker.js', 'utf8');

describe('the app runtime patches', () => {
  it('each match the pinned release once', () => {
    for (const [pattern] of APP_PATCHES) {
      const global = new RegExp(pattern.source, pattern.flags + 'g');
      expect((upstream.match(global) || []).length, String(pattern)).toBe(1);
    }
  });

  it("replace the draw and Decker's drawn keyboard, and keep the probe's patches", () => {
    const patched = patchDecker(upstream, APP_PATCHES);
    expect(patched).toContain('ik_table=(pal,anim)=>');
    expect(patched).not.toContain('for(let z=0,d=0,y=0;y<id.height;y++)');
    expect(patched).toContain('keycaps_enter=_=>{} // Inkventure');
    expect(patched).toContain('ik_fit=min(screen.x*ik_dpr/fb.size.x');
    expect(patched).toContain('zoom=(ik_fit>=1?Math.floor(ik_fit):ik_fit)/ik_dpr');
    expect(patched).toContain('n_play=_=>NIL // Inkventure: silent');
    expect(patched).toContain("c.style.width=(fb.size.x*zoom)+'px'");
    expect(patched).toContain('menus_off=_=>1');
    expect(patched).toContain('ik_wake=_=>');
    expect(patched).toContain('const ccolor=0 // Inkventure: no corners');
  });

  it('fail loudly when the upstream code moved', () => {
    const moved = upstream.replace(
      'keycaps_enter=_=>{if(!enable_touch',
      'keycaps_enter=_=>{if(!touch',
    );
    expect(() => patchDecker(moved, APP_PATCHES)).toThrow(/matched 0 times/);
  });
});

describe('buildAppRuntime', () => {
  it('makes two scripts: Lil with the two globals, then the UI and the bridge, both parse', () => {
    const built = buildAppRuntime({
      lil: readFileSync('vendor/decker/lil.js', 'utf8'),
      danger: readFileSync('vendor/decker/danger.js', 'utf8'),
      decker: upstream,
    });
    expect(built.lil.startsWith('VERSION="1.71"\nDANGEROUS=0\n')).toBe(true);
    expect(built.ui).toContain('ik_bridge=_=>');
    expect(built.ui.trimEnd().endsWith('ik_bridge()')).toBe(true);
    expect(() => new Function(built.lil)).not.toThrow();
    expect(() => new Function(built.ui)).not.toThrow();
  });

  it('fits each script in the lazy-chunk budget once minified', () => {
    const budget = JSON.parse(readFileSync('size-budget.json', 'utf8')) as { lazyChunk: number };
    const files = appRuntimeFiles();
    for (const name of ['lil', 'ui'] as const) {
      expect(files[name]).toMatch(/^\/\* Decker 1\.71 \(c\) John Earnest, MIT licence/);
      expect(gzipSync(files[name]).length, name).toBeLessThan(budget.lazyChunk * 1024);
    }
  });
});

/**
 * The patched `sync` run with a stand-in of Decker's globals: a frame buffer of `w` x `h`, two colours (pixel 0 white,
 * pixel 1 black) and canvases that record what is put on them.
 */
function drawing(w: number, h: number) {
  const puts: Array<{ y: number; h: number }> = [];
  let image: { data: Uint8ClampedArray } | null = null;
  const draws: Array<{ y: number; h: number }> = [];
  const fb = { size: { x: w, y: h }, pix: new Uint8Array(w * h) };
  const deck = { patterns: { pal: { pix: new Uint8Array(64 * 48) }, anim: [[], [], [], []] } };
  class FakeImageData {
    data: Uint8ClampedArray;
    constructor(
      public width: number,
      public height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  const canvas = {
    getContext: () => ({
      putImageData: (
        id: { data: Uint8ClampedArray },
        _x: number,
        _y: number,
        _dx: number,
        dy: number,
        _w: number,
        dh: number,
      ) => {
        image = id;
        puts.push({ y: dy, h: dh });
      },
      drawImage: (_r: unknown, _sx: number, sy: number, _sw: number, sh: number) =>
        draws.push({ y: sy, h: sh }),
      save: () => undefined,
      scale: () => undefined,
      restore: () => undefined,
      imageSmoothingEnabled: true,
    }),
  };
  const env: Record<string, unknown> = {
    fb,
    deck,
    COLORS: [0xffffff, ...new Array(14).fill(0x808080), 0x000000],
    pal_pat: () => 0,
    ANTS: 255,
    PAL_COLORS: 16,
    frame_count: 0,
    q: () => canvas,
    zoom: 1,
    max: Math.max,
    min: Math.min,
    ik_drawn: () => undefined,
    pick_palette: () => undefined,
    ImageData: FakeImageData,
  };
  const names = Object.keys(env);
  const sync = new Function(
    ...names,
    'let ik_rgba,ik_color,ik_table,sync\n' + SYNC + '\nreturn sync',
  )(...names.map((n) => env[n])) as (force?: number) => number;
  return { fb, puts, draws, sync, pixels: () => Array.from(image ? image.data : []) };
}

describe('the draw', () => {
  it('converts and puts only the rows that changed, and nothing when none did', () => {
    const d = drawing(8, 10);
    expect(d.sync()).toBe(1);
    expect(d.puts.pop()).toEqual({ y: 0, h: 10 });
    expect(d.sync()).toBe(0);
    d.fb.pix[3 * 8 + 2] = 1;
    d.fb.pix[5 * 8 + 7] = 1;
    expect(d.sync()).toBe(1);
    expect(d.puts.pop()).toEqual({ y: 3, h: 3 });
    // One row more each side on the screen: the strip's edges at a fractional zoom.
    expect(d.draws.pop()).toEqual({ y: 2, h: 5 });
    expect(d.sync(1)).toBe(1);
    expect(d.puts.pop()).toEqual({ y: 0, h: 10 });
  });

  it('gives each pixel its colour from the table', () => {
    const d = drawing(2, 1);
    d.fb.pix[1] = 1;
    d.sync();
    // Pixel 0 is white, pixel 1 (pattern 1) is black: RGBA bytes, alpha opaque.
    expect(d.pixels()).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });
});
