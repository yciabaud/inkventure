# src/engines

Engine abstraction and adapters (SPEC §4).

- `engine.ts`: the `Engine` interface, `OutputBlock` model and input requests.
- `transcript.ts`: builds the transcript (paragraphs + status line) from `OutputBlock`s.
- `glkote-bridge/`: our GlkOte-compatible display layer. The Glk library drives it with GlkOte JSON updates; it turns
  them into `OutputBlock`s and input requests, and sends the player's input back as GlkOte events. No DOM.
- `zvm/`: the Z-machine engine (lazy chunk). Later: `quixe/`, `ink/`, `twine/`.

## Third-party code

| Package | Version (pinned) | Used for | Licence |
|---|---|---|---|
| [ifvms](https://github.com/curiousdannii/ifvms.js) | 1.1.6 | ZVM, the Z-machine VM (Parchment project) | MIT, © the ifvms.js team |
| [glkote-term](https://github.com/curiousdannii/glkote-term) | 0.4.4 | `src/glkapi.js` only: the Glk API library | MIT, © 2008-2018 Andrew Plotkin, Dannii Willis |

Only `ifvms/src/zvm.js` (and what it requires) and `glkote-term/src/glkapi.js` are bundled; their terminal front ends
are not. Both run from an ES module bundle thanks to small patches applied at build time and checked by tests
(`scripts/build/vendor-patches.ts`): `glkapi.js` becomes a factory (one Glk instance per game, no implicit globals) and
`opcodes.js` stops reading `this` at module level. Upgrading either package means re-checking those patches.

Saves (S1.5): `saveState` uses ZVM's autosave snapshot (`do_autosave`: Quetzal RAM + Glk state, which needs ZVM's Glk
dispatch layer `ifvms/src/zvm/dispatch.js`; importing it also sets an unused `window.GiDispa`). `restoreState` and
`restart` boot a new VM (with `do_vm_autosave` to restore) and only swap it in once it has started, so a bad save leaves
the game running. The text Glk keeps for redrawing (`reserve`) is dropped from snapshots: the reader restores its own
transcript.
