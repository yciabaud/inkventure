# Inkventure

Play interactive fiction from [IFDB](https://ifdb.org) on your e-reader.
Inkventure is a static web app with a Kindle-inspired interface: a home screen of selected adventures,
a filterable library of playable games, and a reader that turns parser and choice-based games into pages
you play mostly by tapping. It is distributed through a free ebook that links straight into the app.

**Play:** open **https://yciabaud.github.io/inkventure/** in your e-reader's web browser.
**Free ebook** (EN/FR, EPUB and AZW3), to download from a computer: https://yciabaud.github.io/inkventure/ebook/

| Home | A parser game | A choice-based game |
|---|---|---|
| ![Home: the Continue hero and the featured shelf](ebook/en/images/home.png) | ![A Z-machine game: the text in pages, the command bar and its verb chips](ebook/en/images/parser.png) | ![An ink story: the text and its choices as large buttons](ebook/en/images/choices.png) |

_Screenshots at 600 × 800 in 16 gray levels, like a small e-reader (taken for the ebook by `npm run ebook:screenshots`)._

## What it does

- **Games:** Z-machine (ZVM), Glulx (Quixe), ink (inkjs, including stories published as web exports) and Twine
  (experimental, in a sandboxed frame), downloaded from the IF Archive and other hosts listed on IFDB.
- **Catalogue:** built every week from IFDB by CI (`scripts/catalog/`), with a curated featured selection;
  search, filters (genre, language, format, rating, play time, illustrated, "Start here"…) and sorting.
- **Reader:** text in pages turned by taps, no scrolling and no animations; command bar with verb chips and words
  you can tap; choice buttons; autosave, five save slots and undo; text settings (typeface, size, margins).
- **E-ink first:** black on white, tap targets ≥ 48 px, small downloads (budgets in `size-budget.json`); English
  and French interface.
- **Private:** no account, no tracking, no cookies; progress stays in the browser (localStorage).

## Links

- Live app: https://yciabaud.github.io/inkventure/ (deployed from `main` after CI passes; build info in
  [`version.json`](https://yciabaud.github.io/inkventure/version.json))
- Free ebook download page: https://yciabaud.github.io/inkventure/ebook/
- Device probe (run it on your e-reader): https://yciabaud.github.io/inkventure/probe/ — see
  [docs/device-reports/](docs/device-reports/README.md); before a release, the
  [real-device checklist](docs/device-checklist.md)
- Specification: [SPEC.md](SPEC.md)
- Backlog and stories: [docs/BACKLOG.md](docs/BACKLOG.md)
- Contributor / agent workflow: [CLAUDE.md](CLAUDE.md)
- Report a problem: [GitHub issues](https://github.com/yciabaud/inkventure/issues)

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev         # dev server
npm run lint        # ESLint, stylelint, Prettier
npm test            # unit tests (Vitest, jsdom)
npm run build       # modern + ES5 legacy bundles in dist/
npm run check:es5   # es-check on the legacy bundle, the device probe and the ebook page
npm run check:size  # asset size budgets (size-budget.json)
npm run test:e2e    # Playwright (set PW_WEBKIT=1 to include WebKit locally; CI always does)
npm run test:production  # smoke test of the live site, real network (PROD_URL=… for another address)
```

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages when the CI workflow succeeds on `main` (or when run
manually), by pushing it to the root of the `gh-pages` branch. `.github/workflows/preview.yml` publishes every pull
request to `https://yciabaud.github.io/inkventure/pr-preview/pr-<number>/` (the link is commented on the PR) and
removes it when the PR is closed. The catalogue comes from the weekly `.github/workflows/catalog.yml` run, which
publishes it on the `catalog` branch and triggers a deployment (see [scripts/catalog/README.md](scripts/catalog/README.md)).
One-time setup: repository **Settings → Pages → Build and deployment → Source:
Deploy from a branch → `gh-pages` / `(root)`**.

After a deployment, and before announcing a release, run the **Production smoke** workflow (Actions → Production
smoke → Run workflow): it checks the live site, its catalogue, a game downloaded from the IF Archive and the ebooks
(`tests/production/`). The site's address lives in one place, `ebook/config.json` (`host`): the ebook's links and the
smoke test read it.

## Credits

- **Games** belong to their authors; each game's IFDB page gives its terms.
- **Catalogue data** (listings, descriptions, ratings, cover art) from [IFDB](https://ifdb.org), the Interactive
  Fiction Database; **game files** from the [IF Archive](https://ifarchive.org), hosted by the
  [Interactive Fiction Technology Foundation](https://iftechfoundation.org).
- **Interpreters:** [ZVM (ifvms.js)](https://github.com/curiousdannii/ifvms.js) and
  [GlkOte (glkote-term)](https://github.com/curiousdannii/glkote-term) by Dannii Willis and others,
  [Quixe](https://github.com/erkyrath/quixe) by Andrew Plotkin, [inkjs](https://github.com/y-lohse/inkjs).
- **Built with** [Preact](https://preactjs.com), [fflate](https://github.com/101arrowz/fflate) and Vite;
  typefaces [Literata](https://github.com/googlefonts/literata) and
  [Source Sans 3](https://github.com/adobe-fonts/source-sans) (SIL Open Font License 1.1).

## Licence

Inkventure is free software under the [MIT licence](LICENSE). The site serves the full licence texts of every
third-party package and font it includes at [`licences.txt`](https://yciabaud.github.io/inkventure/licences.txt),
generated at build time (`scripts/build/licences.ts`, from Vite's list of bundled packages plus Quixe and the legacy
bundle's polyfills); Settings › About in the app gives its address.
