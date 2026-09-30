# src/engines

Engine abstraction and adapters (SPEC §4).

- `engine.ts`: the `Engine` interface, `OutputBlock` model and input requests.
- `transcript.ts`: builds the transcript (paragraphs + status line) from `OutputBlock`s.
- `glkote-bridge/`: our GlkOte-compatible display layer. The Glk library drives it with GlkOte JSON updates; it turns
  them into `OutputBlock`s and input requests, and sends the player's input back as GlkOte events. No DOM.
- `formats.ts`: catalogue format → engine, the lazy loader of each shipped engine, and a header check of story files.
- `zvm/`: the Z-machine engine (lazy chunk).
- `quixe/`: the Glulx engine (lazy chunk), on the Quixe files downloaded into `vendor/quixe/` at install. Later: `ink/`, `twine/`.

## Third-party code

| Package | Version (pinned) | Used for | Licence |
|---|---|---|---|
| [ifvms](https://github.com/curiousdannii/ifvms.js) | 1.1.6 | ZVM, the Z-machine VM (Parchment project) | MIT, © the ifvms.js team |
| [glkote-term](https://github.com/curiousdannii/glkote-term) | 0.4.4 | `src/glkapi.js` only: the Glk API library | MIT, © 2008-2018 Andrew Plotkin, Dannii Willis |
| [Quixe](https://github.com/erkyrath/quixe) | 2.2.6 (tag `quixe-2.2.6`, downloaded at install into `vendor/quixe/`) | Glulx VM, its Glk library (GlkOte 2.3 generation), dispatch layer and Blorb decoder | MIT, © 2010-2024 Andrew Plotkin |

Only `ifvms/src/zvm.js` (and what it requires) and `glkote-term/src/glkapi.js` are bundled; their terminal front ends
are not. Both run from an ES module bundle thanks to small patches applied at build time and checked by tests
(`scripts/build/vendor-patches.ts`): `glkapi.js` becomes a factory (one Glk instance per game, no implicit globals) and
`opcodes.js` stops reading `this` at module level. Upgrading either package means re-checking those patches.

Saves (S1.5): `saveState` uses ZVM's autosave snapshot (`do_autosave`: Quetzal RAM + Glk state, which needs ZVM's Glk
dispatch layer `ifvms/src/zvm/dispatch.js`; importing it also sets an unused `window.GiDispa`). `restoreState` and
`restart` boot a new VM (with `do_vm_autosave` to restore) and only swap it in once it has started, so a bad save leaves
the game running. The text Glk keeps for redrawing (`reserve`) is dropped from snapshots: the reader restores its own
transcript.

Glulx (S1.7): Quixe runs on its own, newer Glk library (Quixe 2.2 needs it), through the same GlkOte bridge, which also
hands that library its `Dialog` (`getlibrary('Dialog')`). A `.gblorb` is unpacked with Quixe's Blorb decoder. VM runs are
**time-sliced** (`SLICE_MS` = 100 ms): past that, Quixe yields to the event loop and carries on from a timer, so the page
can draw "The story is thinking…" and take taps during a long turn; `load`, `restoreState` and `restart` therefore
resolve when the game first waits for input, and a VM being replaced is `abandon()`ed. `saveState` uses Quixe's
autosave snapshot (`do_autosave` with the pending `glk_select` event from `GiDispa.check_autosave`, patched to allow the
first prompt too); the RAM is stored XORed with the story's initial RAM (mostly zeros: the fixture's save deflates to
~1.5 KB). Images are not shown yet (follow-up); sound is ignored; the game's own UNDO uses Quixe's undo, the reader's
Undo its snapshots.
