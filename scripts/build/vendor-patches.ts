// Vite plugin: small, checked patches to the pinned engine packages (ifvms, glkote-term) so they run from an ES module
// bundle. Each patch fails the build loudly if upstream no longer matches.
//
// - glkapi.js (glkote-term) becomes a factory, `module.exports = function createGlk() {…}`. Upstream it assigns an
//   implicit global (`Glk = function () {…}()`) and a few more inside (undeclared loop and temp variables), which
//   throw in the strict mode of an ES module; and it keeps all Glk state in that one instance, so a second game in the
//   same page would inherit the first one's windows and event generation. A fresh instance per game, with those
//   variables declared, solves both.
// - opcodes.js (ifvms) reads `this.e` at module level, which is `undefined` in Node (`this` is `module.exports`) but
//   becomes a read of the not-yet-assigned exports once the CommonJS module is converted: pass `undefined` directly.
import type { Plugin } from 'vite';

type Replacement = [RegExp, string];

interface Patch {
  id: RegExp;
  replacements: Replacement[];
}

export const PATCHES: Patch[] = [
  {
    id: /[\\/]glkote-term[\\/]src[\\/]glkapi\.js$/,
    replacements: [
      [
        /^Glk = function\(\) \{$/m,
        'module.exports = function createGlk() {\n' +
          '/* Undeclared upstream (implicit globals). content_box is only read, on a rare window-close path. */\n' +
          'var lineobj, split, ix, lx, ch, content_box, fref;',
      ],
      [
        /if \(typeof module !== 'undefined' && module\.exports\) \{\s*module\.exports = api;\s*\}/,
        '/* exported by the factory */',
      ],
      [/return api;\s*\}\(\);\s*\/\* End of Glk library\. \*\//, 'return api;\n};'],
    ],
  },
  {
    id: /[\\/]ifvms[\\/]src[\\/]zvm[\\/]opcodes\.js$/,
    replacements: [
      [/^stack_var = new Variable\( this\.e, 0 \),$/m, 'stack_var = new Variable( undefined, 0 ),'],
    ],
  },
];

export function applyPatch(code: string, replacements: Replacement[]): string {
  let out = code;
  for (const [pattern, replacement] of replacements) {
    const next = out.replace(pattern, replacement);
    if (next === out) throw new Error('vendor patch did not apply: ' + String(pattern));
    out = next;
  }
  return out;
}

export function vendorPatchesPlugin(): Plugin {
  return {
    name: 'inkventure-vendor-patches',
    enforce: 'pre',
    transform(code, id) {
      // Only the files themselves: the commonjs plugin also creates proxy modules for them (`…?commonjs-…`).
      if (id.indexOf('?') >= 0) return null;
      for (const patch of PATCHES) {
        if (patch.id.test(id)) return { code: applyPatch(code, patch.replacements), map: null };
      }
      return null;
    },
  };
}
