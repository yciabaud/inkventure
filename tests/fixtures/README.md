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
