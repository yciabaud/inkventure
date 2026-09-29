# Working on Inkventure

Inkventure is a static web app to play IFDB interactive fiction on e-readers (Kindle first).
The source of truth is [SPEC.md](SPEC.md); the work is split into stories in [docs/BACKLOG.md](docs/BACKLOG.md).

## Session workflow

1. Read `SPEC.md` (at least the sections the story references) and `docs/BACKLOG.md`.
2. Pick the story the user names, or else the first `todo` story in the **Suggested order** whose
   dependencies are all `done`.
3. Set its status to `in-progress` in both `docs/BACKLOG.md` and its story file.
4. Work on one branch and open one PR per story. Keep to the story's scope; put anything else in
   "Notes & decisions" as a follow-up (or propose a new story).
5. Implement **with the required tests** (Vitest unit + Playwright e2e) listed in the story.
6. Before pushing, run: `npm run lint && npm test && npm run build && npm run check:es5 && npm run check:size && npm run test:e2e`.
7. When the acceptance criteria are met and CI is green, tick the criteria, set the status to `done` in both
   files, and record deviations and decisions under "Notes & decisions". If the spec changed, update `SPEC.md`
   in the same PR.

## Non-negotiable constraints

- **The Kindle measured in S0.3 is the baseline** (SPEC §2.1–2.2): everything must work on it. Very old e-readers
  are best effort: the ES5 legacy bundle is still built and must pass `es-check es5`, but CSS grid and custom
  properties are allowed. No animations or transitions, tap targets ≥ 48 px, pages instead of scrolling.
- **Asset budgets** (`size-budget.json`) are hard limits: never raise one to make CI pass without the user's agreement.
- **Static only**: no backend; the app never calls the IFDB API (the catalogue is pre-built by CI).
- **All persistence goes through `src/storage/`** — never call `localStorage` directly.
- **All UI strings go through i18n** (`src/i18n/en.json` + `fr.json`, key parity test must pass).
- **No network in unit or e2e tests**: use recorded fixtures and `page.route`.
- Kindle-*inspired* design only: no Amazon logos, icons, fonts or brand names in the UI.
- Code, comments, commits and docs in English.
