import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPatch, PATCHES } from './vendor-patches.ts';

const [GLKAPI, OPCODES] = PATCHES;

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

describe('applyPatch', () => {
  it('fails loudly when upstream no longer matches', () => {
    expect(() => applyPatch('var Glk = {};', GLKAPI.replacements)).toThrow(/did not apply/);
  });
});
