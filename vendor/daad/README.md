# jDAAD (downloaded at install)

[jDAAD](https://github.com/Utodev/jDAAD) 1.2 by Uto (GPL-3, see `LICENSE`), for the DAAD probe only (story S0.13,
`/probe/daad/`). `npm install` / `npm ci` run `scripts/build/fetch-daad.ts` (`postinstall`), which downloads
`jdaad.js`, `jquery-3.6.0.min.js` (MIT, © OpenJS Foundation), `font.js` and `extern.js` from `raw.githubusercontent.com`
at the commit `053903d3`, and checks each against the SHA-256 in `scripts/build/daad-files.ts`. Those files are
ignored by git; only this README and the licence are committed.

The build (`scripts/build/daad-probe.ts`) patches `jdaad.js` for e-ink, transpiles the whole runtime to ES2017 and
writes `dist/probe/daad/runtime.js`, with the licence next to it (`LICENSE-jdaad.txt`) and a link to the source on the
page. The probe page is a separate page that ships jDAAD unchanged in its licence; the app does not include it.
