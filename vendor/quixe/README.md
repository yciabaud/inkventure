# Quixe (downloaded at install)

[Quixe](https://github.com/erkyrath/quixe) 2.2.6, the Glulx interpreter by Andrew Plotkin (MIT, see `LICENSE`), used
**unchanged** from the upstream tag `quixe-2.2.6`. Quixe is not published on npm (the `quixe` package there is an
unofficial 2018 repackaging of an old version) and its repository has no `package.json`, so npm cannot install it:
`npm install` / `npm ci` run `scripts/build/fetch-quixe.ts` (`postinstall`), which downloads the files below from
`raw.githubusercontent.com` at that tag and checks each against the SHA-256 in `scripts/build/quixe-files.ts` (a moved
tag or a bad download fails the install). The `.js` files are ignored by git; only this README and the licence are
committed. Upgrading Quixe = changing the tag and the hashes there (and checking the build patches still apply).

| File (downloaded) | Upstream path | What it is |
|---|---|---|
| `quixe.js` | `src/quixe/quixe.js` | The Glulx VM. |
| `gi_dispa.js` | `src/quixe/gi_dispa.js` | Glk dispatch layer between the VM and the Glk library. |
| `glkapi.js` | `src/glkote/glkapi.js` | The Glk API library (GlkOte 2.3 generation; the Z-machine keeps the older one from `glkote-term`). |
| `gi_blorb.js` | `src/glkote/gi_blorb.js` | Blorb (`.gblorb`) decoder. |

Not copied: `gi_load.js` (page loader: Inkventure downloads and unpacks the story itself), GlkOte's display and
dialog code (replaced by our bridge, `src/engines/glkote-bridge/`), jQuery.

The files are patched into ES modules at build time by `scripts/build/vendor-patches.ts` (each patch fails the build if
upstream changes, and is covered by `vendor-patches.test.ts`): ES exports, no `window` / `document`, no jQuery (the
Blorb metadata chunk is skipped), time slicing of VM runs and `abandon()`, and snapshots allowed at the first prompt.

To upgrade: copy the four files from a newer commit, update the commit above, run `npm test` (patch tests and the
headless Glulx walkthrough) and the Glulx e2e test.
