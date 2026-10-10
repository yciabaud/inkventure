import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRuntime, patchDecker, PATCHES, probeFiles } from './decker-probe';
import { DECKER_BASE, DECKER_FILES, ensureDecker } from './decker-files';
import { sha256 } from './quixe-files';

// The pinned upstream decker.js, downloaded at install (scripts/build/fetch-decker.ts).
const upstream = readFileSync('vendor/decker/decker.js', 'utf8');

describe('patchDecker', () => {
  it('applies every patch to the pinned release', () => {
    const patched = patchDecker(upstream);
    expect(patched).toContain('ik_wake=_=>');
    expect(patched).toContain('sync=force=>{');
    expect(patched).toContain('menus_off=_=>1');
    expect(patched).toContain('show_anim:0');
    expect(patched).toContain("if(0/* Inkventure: no transitions */&&ms.type!='trans'");
    expect(patched).toContain('\tik_drawn();return 1\n}');
    expect(patched).not.toContain('requestAnimationFrame(loop)\n\tif(do_panic)');
    expect(patched).toContain('resize(),ik.started=performance.now(),ik_wake()');
  });

  it('fails loudly when the upstream code it patches moved', () => {
    const moved = upstream.replace("menus_off=_=>lb(ifield(deck,'locked'))", 'menus_off=_=>0');
    expect(() => patchDecker(moved)).toThrow(/matched 0 times in decker\.js/);
  });

  it('fails when a patched line appears twice', () => {
    const doubled = upstream + "\nmenus_off=_=>lb(ifield(deck,'locked'))\n";
    expect(() => patchDecker(doubled)).toThrow(/matched 2 times/);
  });

  it('has one patch per change, each matching once', () => {
    for (const [pattern] of PATCHES) {
      const global = new RegExp(pattern.source, pattern.flags + 'g');
      expect((upstream.match(global) || []).length, String(pattern)).toBe(1);
    }
  });
});

describe('buildRuntime', () => {
  it('is web-decker’s script, patched, with the probe’s marks, and parses', () => {
    const runtime = probeFiles()['probe/decker/runtime.js'];
    expect(runtime).toMatch(/^\/\* Decker 1\.71 \(c\) John Earnest, MIT licence/);
    expect(runtime).toContain('ikDecker.runStart=performance.now()');
    expect(runtime).toContain('VERSION="1.71"\nDANGEROUS=0\n');
    expect(runtime.trimEnd().endsWith('ikDecker.runEnd=performance.now()')).toBe(true);
    // Syntax only: the function is never called.
    expect(() => new Function(runtime)).not.toThrow();
  });

  it('keeps the upstream order: lil.js, danger.js, decker.js', () => {
    const runtime = buildRuntime({ lil: '/*lil*/', danger: '/*danger*/', decker: upstream });
    const lil = runtime.indexOf('/*lil*/');
    const danger = runtime.indexOf('/*danger*/');
    expect(lil).toBeGreaterThan(0);
    expect(danger).toBeGreaterThan(lil);
    expect(runtime.indexOf('ik_wake=_=>')).toBeGreaterThan(danger);
  });
});

// Stand-in contents: the test checks the flow with hashes computed here, not the real files.
function fakeFiles() {
  const contents: Record<string, Uint8Array> = {};
  for (const file of DECKER_FILES)
    contents[file.name] = new TextEncoder().encode('// ' + file.name);
  const files = DECKER_FILES.map((file) => ({ ...file, sha256: sha256(contents[file.name]) }));
  return { contents, files };
}

describe('ensureDecker', () => {
  it('downloads each missing file from the tag and keeps the ones already checked', async () => {
    const { contents, files } = fakeFiles();
    const written: Record<string, Uint8Array> = { 'lil.js': contents['lil.js'] };
    const urls: string[] = [];
    const downloaded = await ensureDecker(
      {
        read: (name) => written[name],
        download: async (url) => {
          urls.push(url);
          const file = files.find((f) => DECKER_BASE + f.path === url)!;
          return contents[file.name];
        },
        write: (name, data) => void (written[name] = data),
      },
      files,
    );
    expect(downloaded).toEqual(['danger.js', 'decker.js', 'tour.deck']);
    expect(urls[0]).toBe(DECKER_BASE + 'js/danger.js');
    expect(Object.keys(written).sort()).toEqual(files.map((f) => f.name).sort());
  });

  it('refuses a file whose hash differs (a moved tag), writing nothing', async () => {
    const { files } = fakeFiles();
    const written: string[] = [];
    await expect(
      ensureDecker(
        {
          read: () => undefined,
          download: async () => new TextEncoder().encode('something else'),
          write: (name) => void written.push(name),
        },
        files,
      ),
    ).rejects.toThrow(/SHA-256 .* expected .* v1\.71/);
    expect(written).toEqual([]);
  });
});
