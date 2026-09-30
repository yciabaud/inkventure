# tests/fixtures

Tiny freely-licensed stories and recorded IFDB JSON. Tests never hit the network.

- `zmachine/lamp.inf` → `lamp.z5`: "The Lamp at Saltmere", a tiny Z-machine game written for Inkventure (MIT).
  Compiled with Inform 6.41 and the Inform 6 standard library 6.12 (traditional Inform licence: compiled games may be
  distributed freely). A key prompt, a status line, a few rooms and a winning ending; the walkthrough is in the source.
  Served by the app at `#/play/fixture-z`. Rebuild with `scripts/fixtures/build-z.sh` (needs Inform 6).
- `glulx/lamp.inf` → `lamp.ulx`: the same game built for Glulx (portable key prompt), compiled with Inform 6.41 and the
  Inform 6 standard library 6.12.2 (which has `infglk.h`, missing from the Debian package). Served by the app at
  `#/play/fixture-glulx`. Rebuild with `scripts/fixtures/build-glulx.sh` (see the script for the library).
- `ink/lamp.ink` → `lamp.json`: the same story told with choices in ink (MIT), with `title` / `chapter` tags and two
  endings. Served by the app at `#/play/fixture-ink`. Rebuild with `scripts/fixtures/build-ink.sh` (inkjs's compiler).
- `twine/lamp-harlowe.twee` → `lamp-harlowe.html` and `twine/lamp-sugarcube.twee` → `lamp-sugarcube.html`: the same
  story (MIT) in Twine's two main story formats, Harlowe 3.3.9 (zlib licence, `LICENSE-harlowe`) and SugarCube 2.37.3
  (BSD 2-clause, `LICENSE-sugarcube`), published with the format files. The Harlowe one has a long passage (the keeper's
  log) for page turns. Served by the app at `#/play/fixture-twine-harlowe` and `#/play/fixture-twine-sugarcube`.
  Rebuild with `node scripts/fixtures/build-twine.ts`, which downloads the formats from the Story Format Archive and
  checks their SHA-256.
