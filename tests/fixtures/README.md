# tests/fixtures

Tiny freely-licensed stories and recorded IFDB JSON. Tests never hit the network.

- `zmachine/lamp.inf` → `lamp.z5`: "The Lamp at Saltmere", a tiny Z-machine game written for Inkventure (MIT).
  Compiled with Inform 6.41 and the Inform 6 standard library 6.12 (traditional Inform licence: compiled games may be
  distributed freely). A key prompt, a status line, a few rooms and a winning ending; the walkthrough is in the source.
  Served by the app at `#/play/fixture-z`. Rebuild with `scripts/fixtures/build-z.sh` (needs Inform 6).
- `glulx/lamp.inf` → `lamp.ulx`: the same game built for Glulx (portable key prompt), compiled with Inform 6.41 and the
  Inform 6 standard library 6.12.2 (which has `infglk.h`, missing from the Debian package). Served by the app at
  `#/play/fixture-glulx`. Rebuild with `scripts/fixtures/build-glulx.sh` (see the script for the library).
- `glulx/media.inf` → `media.ulx`: a few lines of raw Glk calls (MIT, needs only the library's `infglk.h`) that open a
  graphics window, draw into it and play a sound without checking that the interpreter supports either, like
  *Ekphrasis*; then one line of input and the end. Built by the same script.
- `glulx/picture.inf` → `picture.gblorb`: "The Keeper's Picture" (MIT), raw Glk calls that print a few paragraphs, draw
  picture 1 in the main window and answer every command. The same script compiles it and packs it with one 600 × 400
  colour PNG and its alt text into a Blorb (`scripts/fixtures/build-blorb.ts`, which draws the PNG itself); only the
  `.gblorb` is committed. Served by the app at `#/play/fixture-glulx-picture`.
- `ink/lamp.ink` → `lamp.json`: the same story told with choices in ink (MIT), with `title` / `chapter` tags and two
  endings. Served by the app at `#/play/fixture-ink`. Rebuild with `scripts/fixtures/build-ink.sh` (inkjs's compiler).
- `twine/lamp-harlowe.twee` → `lamp-harlowe.html` and `twine/lamp-sugarcube.twee` → `lamp-sugarcube.html`: the same
  story (MIT) in Twine's two main story formats, Harlowe 3.3.9 (zlib licence, `LICENSE-harlowe`) and SugarCube 2.37.3
  (BSD 2-clause, `LICENSE-sugarcube`), published with the format files. The Harlowe one has a long passage (the keeper's
  log) for page turns. Served by the app at `#/play/fixture-twine-harlowe` and `#/play/fixture-twine-sugarcube`.
  The `.html` files are not committed: `npm install` builds them (`scripts/fixtures/build-twine.ts`, which downloads
  the formats once from the Story Format Archive into `vendor/twine/` and checks their SHA-256). Run that script again
  after editing a `.twee`.
