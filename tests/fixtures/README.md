# tests/fixtures

Tiny freely-licensed stories and recorded IFDB JSON. Tests never hit the network.

- `zmachine/lamp.inf` → `lamp.z5`: "The Lamp at Saltmere", a tiny Z-machine game written for Inkventure (MIT).
  Compiled with Inform 6.41 and the Inform 6 standard library 6.12 (traditional Inform licence: compiled games may be
  distributed freely). A key prompt, a status line, a few rooms and a winning ending, plus HELP and LOGBOOK, two
  single-key prompts that name their keys, BOAT (yes/no) and SIGNAL (numbered options) for answer chips, GUIDE (a
  menu drawn in the upper window like Lost Pig's HELP, S1.22), QUOTE (an epigraph in a quote box, Inform's `box`,
  S7.4), VERSE (a quotation in a box at a key prompt, S1.23), a title centred with spaces in the intro (S1.23), and TIPS, which names commands in capitals ("Type WAKE
  UP …, or LOGBOOK …", S1.19), TIDE (a key prompt with a time of 2 s and a routine: the tide rises at each tick, and
  the second ends the prompt, S1.25) and BELL (a line of input with a time of 2 s: a bell rings at each tick, the third
  ends the input; a line typed before is answered); the walkthrough is in the source.
- `zmachine/clock.inf` → `clock.z5` (S1.18): a one-room time game (`Statusline time`), like 9:05: its status line
  shows "Time: 9:05 am" only if the interpreter keeps bit 1 of the header's Flags 1. Same compiler and library.
  Served by the app at `#/play/fixture-z`. Rebuild with `scripts/fixtures/build-z.sh` (needs Inform 6).
- `glulx/lamp.inf` → `lamp.ulx`: the same game built for Glulx (portable key prompt), compiled with Inform 6.41 and the
  Inform 6 standard library 6.12.2 (which has `infglk.h`, missing from the Debian package). Served by the app at
  `#/play/fixture-glulx`. QUOTE shows an epigraph in a quote box (Inform's `box`, S7.4). TIDE waits for a key with
  a timer of 2 s (`glk_request_timer_events`): the tide rises at each event, the second ends the wait (S1.25). Rebuild with
  `scripts/fixtures/build-glulx.sh` (see the script for the library).
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
  `twine/lamp-files.twee` → `lamp-files.zip` (S1.11): a short Harlowe version in `Lamp/index.html`, zipped with files
  of its own: a picture (`img/lamp.png`), a font (`fonts/lamp.woff2`, Literata, OFL), a linked stylesheet with a
  `url(…)` to the picture, a linked script, and a sound (dropped). Small enough (< 512 KB) to be cached with its files.
  The `.html` and `.zip` files are not committed: `npm install` builds them (`scripts/fixtures/build-twine.ts`, which downloads
  the formats once from the Story Format Archive into `vendor/twine/` and checks their SHA-256). Run that script again
  after editing a `.twee`.
- `pictures.json`: picture counts in the shape of `data/cache/pictures.json` (what `scripts/catalog/check-pictures.ts`
  records), read by the sample catalogue: the synthetic Glulx game "Bells of Aldermere" counts as illustrated (S2.5).
  The Blorb parser's tests build their story files with `scripts/fixtures/build-blorb.ts`.
- `#/play/fixture-decker` (S1.29): Decker's guided tour (`examples/decks/tour.deck`, by John Earnest, MIT), downloaded
  at install with the runtime (`vendor/decker/`, not committed) and built into the app as an asset.
