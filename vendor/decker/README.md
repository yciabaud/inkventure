# Decker (downloaded at install)

[Decker](https://github.com/JohnEarnest/Decker) 1.71 by John Earnest (MIT, see `LICENSE`), for the Decker reader (story
S1.29) and the Decker probe (story S0.11, `/probe/decker/`). `npm install` / `npm ci` run `scripts/build/fetch-decker.ts` (`postinstall`), which
downloads the web runtime's scripts (`js/lil.js`, `js/danger.js`, `js/decker.js`) and the guided tour deck
(`examples/decks/tour.deck`, by the same author, same licence) from `raw.githubusercontent.com` at the tag `v1.71`, and
checks each against the SHA-256 in `scripts/build/decker-files.ts`. Those files are ignored by git; only this README and
the licence are committed.

The build (`scripts/build/decker-probe.ts`) patches `decker.js` for e-ink and writes `dist/probe/decker/runtime.js`;
each patch must match the pinned code exactly once, so an upgrade (a new tag and new hashes) fails the build until the
patches are checked.

The app's runtime (`scripts/build/decker-runtime.ts`, story S1.29) applies the probe's patches and its own (draw of the
changed rows only, no drawn keyboard, the bridge to the reader) and is built as two minified assets; the tour deck is
the reader's fixture (`#/play/fixture-decker`).
