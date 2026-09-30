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
//
// Quixe (vendor/quixe/, copied unchanged from upstream; see vendor/quixe/README.md) is made of browser scripts that
// define classes as globals and export them only to CommonJS:
// - each file exports its class as an ES module instead, without creating the unused default instance;
// - `qlog` no longer reads `window` (absent in unit tests);
// - glkapi.js: GlkOte is always passed in, and it reports no canvas (Inkventure draws no graphics windows);
// - glkapi.js: sound is silent. Upstream never creates a sound channel (`glk_schannel_create` returns null) and every
//   other channel call throws "invalid schannel", which stops games that play sounds without checking the channel
//   they got (or the Sound gestalt): these calls do nothing instead, and the play calls report failure (0);
// - gi_dispa.js: `check_autosave` also allows the first prompt, before any event;
// - gi_blorb.js: the IFmd (metadata) chunk is skipped: its parser needs jQuery, and the catalogue has the metadata;
// - quixe.js: time slicing (SPEC §4.5). With the `slice_ms` option, `execute_loop` yields to the event loop once a
//   run has taken that long, and carries on from a timer; `abandon()` stops a VM that is being replaced.
import type { Plugin } from 'vite';

type Replacement = [RegExp, string];

// `qlog` (quixe.js, glkapi.js) tests `window.console`.
const QLOG =
  /^ {4}if \(window\.console && console\.log\)\n {8}console\.log\(msg\);\n {4}else if \(window\.opera && opera\.postError\)\n {8}opera\.postError\(msg\);$/m;
const QLOG_FIXED =
  "    if (typeof console !== 'undefined' && console.log)\n        console.log(msg);";

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
  {
    id: /[\\/]vendor[\\/]quixe[\\/]quixe\.js$/,
    replacements: [
      [
        /^var Quixe = new QuixeClass\(\);\s*\/\/ Node-compatible behavior\s*try \{ exports\.Quixe = Quixe; exports\.QuixeClass = QuixeClass; \} catch \(ex\) \{\};$/m,
        'export { QuixeClass };',
      ],
      [QLOG, QLOG_FIXED],
      [
        /^var opt_clear_vm_autosave = null;$/m,
        'var opt_clear_vm_autosave = null;\nvar opt_slice_ms = 0;',
      ],
      [
        /^ {8}opt_clear_vm_autosave = all_options\.clear_vm_autosave;$/m,
        '        opt_clear_vm_autosave = all_options.clear_vm_autosave;\n' +
          '        opt_slice_ms = all_options.slice_ms || 0;',
      ],
      [
        /^ {4}pathstart = new Date\(\)\.getTime\(\); \/\/###stats\n\n {4}while \(!self\.done_executing\) \{$/m,
        '    pathstart = new Date().getTime(); //###stats\n' +
          '    var sliceend = opt_slice_ms ? pathstart + opt_slice_ms : 0, slicecount = 0;\n\n' +
          '    while (!self.done_executing) {\n' +
          '        if (sliceend && ++slicecount >= 256) {\n' +
          '            slicecount = 0;\n' +
          '            if (new Date().getTime() >= sliceend) {\n' +
          '                setTimeout(function() { if (!self.abandoned) quixe_resume(); }, 0);\n' +
          '                return;\n' +
          '            }\n' +
          '        }',
      ],
      [
        /^ {4}do_autosave: vm_autosave$/m,
        '    do_autosave: vm_autosave,\n    abandon: function() { self.abandoned = true; }',
      ],
    ],
  },
  {
    id: /[\\/]vendor[\\/]quixe[\\/]glkapi\.js$/,
    replacements: [
      [
        /^var Glk = new GlkClass\(\);\s*\/\/ Node-compatible behavior\s*try \{ exports\.Glk = Glk; exports\.GlkClass = GlkClass; \} catch \(ex\) \{\};$/m,
        'export { GlkClass };',
      ],
      [QLOG, QLOG_FIXED],
      [
        /^ {4}else if \(window\.GlkOteClass\) \{\n {8}GlkOte = new window\.GlkOteClass\(\);\n {4}\}$/m,
        '',
      ],
      [
        /^ {4}has_canvas = \(document\.createElement\('canvas'\)\.getContext != undefined\);$/m,
        '    has_canvas = false;',
      ],
      [
        /^ {4}throw\('glk_schannel_(play|play_ext|play_multi): invalid schannel'\);$/gm,
        '    return 0; /* no sound: nothing played */',
      ],
      [
        /^ {4}throw\('glk_schannel_(destroy|stop|set_volume|pause|unpause|set_volume_ext): invalid schannel'\);$/gm,
        '    /* no sound: nothing to do */',
      ],
    ],
  },
  {
    id: /[\\/]vendor[\\/]quixe[\\/]gi_dispa\.js$/,
    replacements: [
      [
        /^try \{ exports\.GiDispaClass = GiDispaClass; \} catch \(ex\) \{\};$/m,
        'export { GiDispaClass };',
      ],
      // The first prompt (no event yet) can be snapshotted too, like any later one: Undo and resume from turn 0.
      [
        /^ {8}if \(last_event_type == 2 \|\| last_event_type == 3 $/m,
        '        if (last_event_type == -1 || last_event_type == 2 || last_event_type == 3',
      ],
    ],
  },
  {
    id: /[\\/]vendor[\\/]quixe[\\/]gi_blorb\.js$/,
    replacements: [
      [
        /^try \{ exports\.BlorbClass = BlorbClass; \} catch \(ex\) \{\};$/m,
        'export { BlorbClass };',
      ],
      [/^ {8}if \(chunktype == "IFmd"\) \{$/m, '        if (false) { /* IFmd: needs jQuery */'],
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
