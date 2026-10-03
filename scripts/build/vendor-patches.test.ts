import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPatch, PATCHES } from './vendor-patches.ts';

const [GLKAPI, OPCODES, QUIXE, QUIXE_GLKAPI, GI_DISPA, GI_BLORB] = PATCHES;
const ZVM_IO = PATCHES[PATCHES.length - 1];

function load(code: string) {
  const module = { exports: {} as unknown };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports as () => Record<string, unknown>;
}

describe('glkapi.js patch', () => {
  const source = readFileSync('node_modules/glkote-term/src/glkapi.js', 'utf8');

  it('exports a factory of independent Glk instances', () => {
    const createGlk = load(applyPatch(source, GLKAPI.replacements));
    const a = createGlk();
    const b = createGlk();
    expect(typeof a.glk_select).toBe('function');
    expect(a).not.toBe(b);
  });

  it('runs in strict mode (no implicit globals)', () => {
    const createGlk = load('"use strict";\n' + applyPatch(source, GLKAPI.replacements));
    expect(typeof createGlk().init).toBe('function');
  });
});

describe('opcodes.js patch', () => {
  it('no longer reads `this` at module level', () => {
    const source = readFileSync('node_modules/ifvms/src/zvm/opcodes.js', 'utf8');
    const patched = applyPatch(source, OPCODES.replacements);
    expect(patched).toContain('stack_var = new Variable( undefined, 0 ),');
    expect(patched).not.toMatch(/^stack_var = new Variable\( this\.e/m);
  });
});

describe('io.js patch (ifvms)', () => {
  it("keeps Flags 1 bit 1, Inform's time game flag, in versions 4 and later", () => {
    const source = readFileSync('node_modules/ifvms/src/zvm/io.js', 'utf8');
    const patched = applyPatch(source, ZVM_IO.replacements);
    expect(ZVM_IO.id.test('node_modules/ifvms/src/zvm/io.js')).toBe(true);
    expect(patched).toContain('| (ram.getUint8(0x01) & 0x02) // Preserve bit 1');
  });
});

describe('Quixe patches', () => {
  const read = (name: string) => readFileSync('vendor/quixe/' + name, 'utf8');

  it('turn each vendored file into an ES module exporting its class', () => {
    expect(applyPatch(read('quixe.js'), QUIXE.replacements)).toMatch(/^export \{ QuixeClass \};$/m);
    expect(applyPatch(read('glkapi.js'), QUIXE_GLKAPI.replacements)).toMatch(
      /^export \{ GlkClass \};$/m,
    );
    expect(applyPatch(read('gi_dispa.js'), GI_DISPA.replacements)).toMatch(
      /^export \{ GiDispaClass \};$/m,
    );
    expect(applyPatch(read('gi_blorb.js'), GI_BLORB.replacements)).toMatch(
      /^export \{ BlorbClass \};$/m,
    );
  });

  it('add time slicing and abandon() to Quixe', () => {
    const quixe = applyPatch(read('quixe.js'), QUIXE.replacements);
    expect(quixe).toContain('opt_slice_ms = all_options.slice_ms || 0;');
    expect(quixe).toContain('if (!self.abandoned) quixe_resume();');
    expect(quixe).toContain('abandon: function() { self.abandoned = true; }');
  });

  it('make sound calls silent instead of throwing', () => {
    const glkapi = applyPatch(read('glkapi.js'), QUIXE_GLKAPI.replacements);
    expect(glkapi).not.toMatch(/throw\('glk_schannel_(?!get_rock)\w+: invalid schannel'\)/);
    expect(glkapi.match(/return 0; \/\* no sound: nothing played \*\//g)).toHaveLength(3);
  });

  it('create graphics windows even without a canvas', () => {
    const glkapi = applyPatch(read('glkapi.js'), QUIXE_GLKAPI.replacements);
    expect(glkapi).not.toContain('Graphics windows not supported; silently return null');
    expect(glkapi).toContain('Created even without a canvas: the bridge ignores what is drawn.');
  });

  it('leave no window, document or jQuery on the paths the app runs', () => {
    const glkapi = applyPatch(read('glkapi.js'), QUIXE_GLKAPI.replacements);
    expect(glkapi).not.toMatch(/window\.GlkOteClass|document\.createElement/);
    expect(applyPatch(read('gi_blorb.js'), GI_BLORB.replacements)).toContain(
      'if (false) { /* IFmd: needs jQuery */',
    );
  });
});

describe('applyPatch', () => {
  it('fails loudly when upstream no longer matches', () => {
    expect(() => applyPatch('var Glk = {};', GLKAPI.replacements)).toThrow(/did not apply/);
  });
});
