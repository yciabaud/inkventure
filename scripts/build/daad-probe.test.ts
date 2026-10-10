// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { buildSource, HEADER, patchDaad, PATCHES, probeFiles } from './daad-probe';
import { DAAD_BASE, DAAD_FILES, ensureDaad } from './daad-files';
import { imagesJs } from './daad-game/pictures';
import { sha256 } from './quixe-files';

// The pinned upstream jdaad.js, downloaded at install (scripts/build/fetch-daad.ts).
const upstream = readFileSync('vendor/daad/jdaad.js', 'utf8');

describe('patchDaad', () => {
  it('applies every patch to the pinned commit', () => {
    const patched = patchDaad(upstream);
    expect(patched).toContain('const DEBUG_ENABLED = false;');
    expect(patched).toContain('condactRoutine: ik_DISPLAY,');
    expect(patched).toContain('ik_pixel(currentContext, x, y, r, g, b);');
    expect(patched).toContain('ik_fill(paper, X, Y, width, height, colours[paperColor]);');
    expect(patched).toContain('var img = ik_get(currentContext, ');
    expect(patched).toContain('ik_put(currentContext, img, ');
    expect(patched).toContain('isMobileDevice = !!ik.keyboard;');
    expect(patched).toContain('virtualKeys.forEach(ik_bindKey);');
    // No canvas drawing is left but the one in ik_flush (prelude): every fillRect and drawImage went.
    expect(patched).not.toMatch(/\.fillRect\(|\.drawImage\(|\.getImageData\(|\.putImageData\(/);
    expect(patched).not.toContain("'ontouchstart' in document.documentElement");
    expect(patched).not.toContain("$('#virtualKeyboardDAAD').css('top'");
  });

  it('fails loudly when the upstream code it patches moved', () => {
    const moved = upstream.replace('const DEBUG_ENABLED = true;', 'const DEBUG_ENABLED = 1;');
    expect(() => patchDaad(moved)).toThrow(/matched 0 times in jdaad\.js/);
  });

  it('fails when a patched line appears twice', () => {
    const doubled = upstream + '\nconst DEBUG_ENABLED = true;\n';
    expect(() => patchDaad(doubled)).toThrow(/matched 2 times/);
  });

  it('has one patch per change, each matching once', () => {
    for (const [pattern] of PATCHES) {
      const global = new RegExp(pattern.source, pattern.flags + 'g');
      expect((upstream.match(global) || []).length, String(pattern)).toBe(1);
    }
  });
});

describe('the runtime', () => {
  const runtime = probeFiles()['probe/daad/runtime.js'];

  it('starts with the licence notice and keeps jQuery’s', () => {
    expect(runtime.startsWith(HEADER)).toBe(true);
    expect(HEADER).toMatch(/^\/\* jDAAD 1\.2 \(commit 053903d3\) \(c\) Uto, GPL-3 licence/);
    expect(runtime).toContain('jQuery v3.6.0 | (c) OpenJS Foundation');
  });

  it('is ES2017: the class fields of jdaad.js are transpiled', () => {
    // Upstream needs ES2022 (class fields): acorn refuses it as ES2017, and takes the runtime.
    expect(() => parse(upstream, { ecmaVersion: 2017 })).toThrow();
    expect(() => parse(runtime, { ecmaVersion: 2017 })).not.toThrow();
  });

  it('keeps jDAAD’s index.html order, with the probe’s marks', () => {
    const source = buildSource({
      jquery: '/*jquery*/',
      font: '/*font*/',
      extern: '/*extern*/',
      jdaad: upstream,
    });
    const order = [
      'ikDaad.runStart',
      '/*jquery*/',
      '/*font*/',
      'var jDAADSounds = [];',
      '/*extern*/',
    ];
    const at = order.map((mark) => source.indexOf(mark));
    expect(at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]))).toBe(true);
    expect(source.indexOf('function ik_flush()')).toBeGreaterThan(at[at.length - 1]);
    expect(source.indexOf('const DEBUG_ENABLED = false;')).toBeGreaterThan(
      source.indexOf('function ik_flush()'),
    );
    expect(
      source.trimEnd().endsWith('ikDaad.runEnd = window.performance ? performance.now() : 0;'),
    ).toBe(true);
  });
});

describe('The Lamp Room', () => {
  it('has the committed pictures, rebuilt byte for byte', () => {
    expect(imagesJs()).toBe(readFileSync('public/probe/daad/images.js', 'utf8'));
  });

  it('has its database in jDAAD’s format: a DAAD version 3 DDB', () => {
    const jddb = readFileSync('public/probe/daad/lamp-room.jddb', 'utf8');
    expect(jddb.startsWith('var DDBDATA = [\n0x3,')).toBe(true);
  });
});

// Stand-in contents: the test checks the flow with hashes computed here, not the real files.
function fakeFiles() {
  const contents: Record<string, Uint8Array> = {};
  for (const file of DAAD_FILES) contents[file.name] = new TextEncoder().encode('// ' + file.name);
  const files = DAAD_FILES.map((file) => ({ ...file, sha256: sha256(contents[file.name]) }));
  return { contents, files };
}

describe('ensureDaad', () => {
  it('downloads each missing file from the commit and keeps the ones already checked', async () => {
    const { contents, files } = fakeFiles();
    const written: Record<string, Uint8Array> = { 'font.js': contents['font.js'] };
    const urls: string[] = [];
    const downloaded = await ensureDaad(
      {
        read: (name) => written[name],
        download: async (url) => {
          urls.push(url);
          const file = files.find((f) => DAAD_BASE + f.path === url)!;
          return contents[file.name];
        },
        write: (name, data) => void (written[name] = data),
      },
      files,
    );
    expect(downloaded).toEqual(['jquery-3.6.0.min.js', 'extern.js', 'jdaad.js']);
    expect(urls[0]).toBe(DAAD_BASE + 'jquery-3.6.0.min.js');
    expect(Object.keys(written).sort()).toEqual(files.map((f) => f.name).sort());
  });

  it('refuses a file whose hash differs, writing nothing', async () => {
    const { files } = fakeFiles();
    const written: string[] = [];
    await expect(
      ensureDaad(
        {
          read: () => undefined,
          download: async () => new TextEncoder().encode('something else'),
          write: (name) => void written.push(name),
        },
        files,
      ),
    ).rejects.toThrow(/SHA-256 .* expected /);
    expect(written).toEqual([]);
  });

  it('pins every file of the runtime to the commit', () => {
    expect(DAAD_BASE).toBe(
      'https://raw.githubusercontent.com/Utodev/jDAAD/053903d3326d7cf1aaa321f05928efa158e9c472/',
    );
    expect(DAAD_FILES.map((f) => f.name).sort()).toEqual([
      'extern.js',
      'font.js',
      'jdaad.js',
      'jquery-3.6.0.min.js',
    ]);
  });
});
