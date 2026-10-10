# Bitsy (downloaded at install)

[Bitsy](https://codeberg.org/adamledoux/bitsy) 8.14 by Adam Le Doux and the Bitsy authors (MIT, see `LICENSE`), for
the Bitsy probe only (story S0.12, `/probe/bitsy/`). `npm install` / `npm ci` run `scripts/build/fetch-bitsy.ts`
(`postinstall`), which downloads the engine (`editor/script/engine/*.js`), two files of its system layer
(`editor/script/system/system.js`, `graphics.js`), the default font (`ascii_small.bitsyfont`) and the editor's default
game (`dev/resources/defaultGameData.bitsy`) from Codeberg at the commit `2f5eecf8`, and checks each against the
SHA-256 in `scripts/build/bitsy-files.ts`. Those files are ignored by git; only this README and the licence are
committed.

The build (`scripts/build/bitsy-probe.ts`) writes `dist/probe/bitsy/runtime.js`: the engine and those two files
unchanged, with Inkventure's e-ink input, sound and loop (`scripts/build/bitsy-eink/`) around them.
