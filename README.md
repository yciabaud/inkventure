# Inkventure

Play interactive fiction from [IFDB](https://ifdb.org) on your e-reader.
Inkventure is a static web app with a Kindle-inspired interface: a home screen of selected adventures,
a filterable library of playable games, and a reader that turns parser and choice-based games into pages
you play mostly by tapping. It is distributed through a free ebook that links straight into the app.

- Live app: https://yciabaud.github.io/inkventure/ (deployed from `main` after CI passes; build info in
  [`version.json`](https://yciabaud.github.io/inkventure/version.json))
- Device probe (run it on your e-reader): https://yciabaud.github.io/inkventure/probe/ — see
  [docs/device-reports/](docs/device-reports/README.md)
- Specification: [SPEC.md](SPEC.md)
- Backlog and stories: [docs/BACKLOG.md](docs/BACKLOG.md)
- Contributor / agent workflow: [CLAUDE.md](CLAUDE.md)

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev         # dev server
npm run lint        # ESLint, stylelint, Prettier
npm test            # unit tests (Vitest, jsdom)
npm run build       # modern + ES5 legacy bundles in dist/
npm run check:es5   # es-check on the legacy bundle and the device probe
npm run check:size  # asset size budgets (size-budget.json)
npm run test:e2e    # Playwright (set PW_WEBKIT=1 to include WebKit locally; CI always does)
```

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages when the CI workflow succeeds on `main` (or when run
manually). One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
