# ebook

Sources of the free Inkventure ebook (SPEC §8), one folder per UI locale, built by
[`scripts/ebook/build.ts`](../scripts/ebook/build.ts):

- `config.json`: the app's address (target of the "Play now" links and QR codes) and the number of game cards.
- `ebook.css`: styles for e-readers.
- `<locale>/book.json`: metadata (title, subtitle, identifier, rights…) and the card strings; the length labels and
  the "Start here" badge come from the app's `src/i18n/<locale>.json`.
- `<locale>/NN-*.md`: the chapters, in file name order (Pandoc Markdown). `{{host}}` is replaced by the app's address;
  the `<!-- cards -->` marker (in exactly one chapter) by the game cards, made from the catalogue's `featured.json`
  (curated games first) with their IFDB cover thumbnail, or a text placeholder.
- `<locale>/images/`: screenshots of the app in grayscale (16 levels), referenced by the chapters as
  `images/<name>.png`. They are committed: after a visible change to Home or the reader, run
  `npm run build && npm run ebook:screenshots` (the production build at 600 × 800, with the sample catalogue and the
  test fixtures, no network) and check them before committing.

## Building

```sh
sudo apt-get install pandoc epubcheck calibre   # once
npm run ebook                                   # → ebook/build/inkventure-<locale>.epub and .azw3
npm run ebook -- --offline --locale en          # no cover download, English only
```

Other options: `--catalog DIR` (default `public/catalog`, the sample catalogue unless
`scripts/catalog/use-published.sh` replaced it), `--out DIR`, `--host URL`, `--no-check` (skip EPUBCheck),
`--no-azw3`. The cover is rendered with Playwright's Chromium. The Ebook workflow (`.github/workflows/ebook.yml`)
builds both books from the published catalogue on every `v*` tag and uploads them as an artifact.

The output folder also gets a cover thumbnail per locale (`inkventure-<locale>-cover.jpg`) and `books.json` (each
file's locale, format, size, build date and commit), for the download page. The Deploy workflow builds the books on
each deployment of `main` and publishes them under `ebook/` on the site, next to that page
(`src/ebook-page/page.ts`, written into the build by `scripts/build/ebook-page.ts`). The file names have no version,
so shared links keep working.
