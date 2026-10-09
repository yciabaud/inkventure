# Inkventure — Backlog

Stories are sized for one working session / one pull request. Each story file is self-contained:
user story, scope, acceptance criteria, required tests, out of scope. See [CLAUDE.md](../CLAUDE.md) for the workflow
and [SPEC.md](../SPEC.md) for the full specification.

Ideas beyond V1 (not yet stories) are collected in [post-v1-ideas.md](post-v1-ideas.md).

Statuses: `todo` · `in-progress` · `done` · `blocked` · `dropped`. Keep the status here **and** in the story file in sync.

## Epics

| Epic | Name |
|---|---|
| E0 | Foundations |
| E1 | Reader & engines |
| E2 | Catalogue pipeline |
| E3 | Library |
| E4 | Home |
| E5 | Settings & data |
| E6 | Ebook |
| E7 | Release |

## Suggested order

The order respects dependencies and reaches a playable Z-machine game (end of M1) as early as possible:

S0.1 → S0.4 → S0.7 → S0.6 → S0.2 → S0.3 → S0.5 → S0.8 → S1.1 → S1.3 → S1.2 → S1.4 → S1.5 → S1.6 → S2.1 → S2.2 → S2.3 → S3.1 → S2.4 → S3.2 → S3.3 → S3.4 → S4.1 → S4.2 → S5.1 → S1.7 → S1.8 → S1.9 → S1.10 → S1.11 → S2.5 → S2.6 → S6.1 → S6.2 → S6.3 → S7.1 → S2.7 → S7.2 → S1.13 → S1.12 → S1.14 → S1.15 → S1.16 → S1.17 → S0.10 → S1.18 → S1.19 → S1.21 → S0.9 → S5.3 → S1.22 → S7.3 → S7.4 → S1.24 → S1.23 → S2.8 → S7.5 → S1.25

M6 (play fidelity) comes from the [2026-10-01 comparison](reports/rendering-2026-10-01/README.md) of the 32 featured games with Parchment and the original
Twine pages: the two blockers first (S1.13 is the smallest), then the stories that make menus and questions usable.

M7 (offline) started with a device spike: the S0.9 probe showed the Kindle can open a page and read kept files with Wi-Fi
off, so S5.3 keeps its full scope.

Stories of the **Post-V1** milestone are written but not in this order: they wait until V1 is out.

## Stories

| ID | Title | Epic | Milestone | Depends on | Status |
|---|---|---|---|---|---|
| [S0.1](stories/S0.1-project-scaffold.md) | Project scaffold, tooling & CI | E0 | M0 | — | done |
| [S0.2](stories/S0.2-github-pages-deploy.md) | GitHub Pages deployment | E0 | M0 | S0.1 | done |
| [S0.3](stories/S0.3-kindle-capability-probe.md) | Kindle capability probe page (spike) | E0 | M0 | S0.2 | done |
| [S0.4](stories/S0.4-eink-design-system-shell.md) | E-ink design system, app shell & hash router | E0 | M0 | S0.1 | done |
| [S0.5](stories/S0.5-i18n-framework.md) | Internationalisation framework (EN/FR) | E0 | M0 | S0.4 | done |
| [S0.6](stories/S0.6-storage-layer.md) | Storage layer (localStorage, versioned schema, quota, LRU) | E0 | M0 | S0.1 | done |
| [S0.7](stories/S0.7-asset-size-budgets.md) | Asset size budgets in CI | E0 | M0 | S0.1 | done |
| [S0.8](stories/S0.8-pr-preview-deployments.md) | Pull request preview deployments | E0 | M0 | S0.2 | done |
| [S0.9](stories/S0.9-offline-probe.md) | Offline probe on the Kindle (spike) | E0 | M7 | S0.3 | done |
| [S0.10](stories/S0.10-first-load-budget.md) | First-load budget: measure what the Kindle loads, and slim the bundle | E0 | M6 | S0.7, S0.3 | done |
| [S1.1](stories/S1.1-paginated-text-view.md) | Paginated text view with tap zones | E1 | M1 | S0.4 | done |
| [S1.2](stories/S1.2-reader-settings.md) | Reader settings (Aa menu) | E1 | M1 | S1.1, S0.6 | done |
| [S1.3](stories/S1.3-engine-zmachine.md) | Engine abstraction, Glk display bridge & Z-machine (ZVM) | E1 | M1 | S1.1 | done |
| [S1.4](stories/S1.4-command-bar-chips.md) | Command bar, shortcut chips & history | E1 | M1 | S1.3 | done |
| [S1.5](stories/S1.5-saves-autosave-undo.md) | Autosave, resume, save slots & undo | E1 | M1 | S1.3, S0.6 | done |
| [S1.6](stories/S1.6-status-line-transcript.md) | Status line & transcript view | E1 | M1 | S1.3 | done |
| [S1.7](stories/S1.7-engine-glulx.md) | Glulx support (Quixe) & performance flag | E1 | M4 | S1.5, S1.4 | done |
| [S1.8](stories/S1.8-engine-ink.md) | Ink support (inkjs) & choice buttons | E1 | M4 | S1.5 | done |
| [S1.9](stories/S1.9-engine-twine.md) | Twine support in a sandboxed iframe (experimental) | E1 | M4 | S1.1, S3.4 | done |
| [S1.10](stories/S1.10-glulx-images.md) | Images in Glulx games (grayscale) | E1 | M4 | S1.7 | done |
| [S1.11](stories/S1.11-twine-zip-assets.md) | Twine stories with files in their zip (images, fonts, styles) | E1 | M4 | S1.9, S3.4 | done |
| [S1.12](stories/S1.12-single-key-prompts.md) | Single-key prompts: key chips and a one-key field | E1 | M6 | S1.4, S1.7 | done |
| [S1.13](stories/S1.13-twine-animation-end-state.md) | Twine: animations jump to their end state | E1 | M6 | S1.9 | done |
| [S1.14](stories/S1.14-twine-readable-colours.md) | Twine: readable colours on e-ink | E1 | M6 | S1.9 | done |
| [S1.15](stories/S1.15-status-line-rows.md) | Status line: every row of the status window | E1 | M6 | S1.6 | done |
| [S1.16](stories/S1.16-cleared-screens-and-menus.md) | Cleared screens and menus: one screen, not a pile | E1 | M6 | S1.12, S1.15 | done |
| [S1.17](stories/S1.17-contextual-answer-chips.md) | Answer chips for yes/no and numbered questions | E1 | M6 | S1.4 | done |
| [S1.18](stories/S1.18-small-rendering-fixes.md) | Small rendering fixes: spaces, 9:05's clock, Twine edges | E1 | M6 | S1.3, S1.9 | done |
| [S1.19](stories/S1.19-capitalised-command-chips.md) | Chips for the commands the text names in capitals | E1 | M6 | S1.4 | done |
| [S1.20](stories/S1.20-tappable-compass.md) | Tappable compass in the status window | E1 | Post-V1 | S1.15, S1.4 | todo |
| [S1.21](stories/S1.21-parser-question-nouns.md) | Object chips when the parser asks what to act on | E1 | M6 | S1.4, S1.17, S1.19 | done |
| [S1.22](stories/S1.22-upper-window-menus.md) | Menus drawn in the upper window | E1 | M6 | S1.15, S1.16, S1.12 | done |
| [S1.23](stories/S1.23-upper-window-quote-boxes.md) | Tall upper windows: quote boxes, title cards and extra rows | E1 | M6 | S1.22, S7.3, S7.4 | done |
| [S1.24](stories/S1.24-restore-prompt-freeze.md) | Z-machine games freeze on a cancelled restore prompt | E1 | M6 | S1.3 | done |
| [S1.25](stories/S1.25-timer-events.md) | Timer events for games that run on a clock | E1 | M6 | S1.3, S1.7 | in-progress |
| [S2.1](stories/S2.1-ifdb-crawler.md) | IFDB crawler with recorded fixtures | E2 | M2 | S0.1 | done |
| [S2.2](stories/S2.2-playability-resolution.md) | Playability resolution & content policy | E2 | M2 | S2.1 | done |
| [S2.3](stories/S2.3-index-emitter-workflow.md) | Sharded catalogue index & scheduled workflow | E2 | M2 | S2.2 | done |
| [S2.4](stories/S2.4-featured-json.md) | Featured selection file & validation | E2 | M2 | S2.3 | done |
| [S2.5](stories/S2.5-illustrated-games.md) | Illustrated games: detection, badge & filter | E2 | M4 | S1.10, S2.3, S3.2 | done |
| [S2.6](stories/S2.6-file-language.md) | The language of the file we play, not of every version | E2 | M4 | S2.2, S2.3 | done |
| [S2.7](stories/S2.7-ink-web-exports.md) | Ink games published as web exports | E2 | M4 | S1.8, S2.2, S3.4 | done |
| [S2.8](stories/S2.8-catalogue-story-file-check.md) | The catalogue keeps only story files that open | E2 | M6 | S2.2, S7.4 | done |
| [S3.1](stories/S3.1-catalog-loader-search.md) | Catalogue loader & text search | E3 | M3 | S2.3, S0.5 | done |
| [S3.2](stories/S3.2-library-filters-sort.md) | Library filters & sorting | E3 | M3 | S3.1 | done |
| [S3.3](stories/S3.3-game-detail.md) | Game detail screen | E3 | M3 | S3.1 | done |
| [S3.4](stories/S3.4-game-file-loader.md) | Game file loader from IF Archive | E3 | M3 | S3.3, S1.3, S0.6 | done |
| [S4.1](stories/S4.1-home-featured.md) | Home: Featured shelf & first-launch state | E4 | M3 | S2.4, S3.3 | done |
| [S4.2](stories/S4.2-home-my-adventures.md) | Home: My adventures & Continue hero | E4 | M3 | S4.1, S1.5 | done |
| [S5.1](stories/S5.1-settings-screen.md) | Settings screen & About | E5 | M3 | S0.5, S0.6, S1.2 | done |
| [S5.2](stories/S5.2-export-import.md) | Export / import data as a text code | E5 | M3 | S5.1, S1.5 | dropped |
| [S5.3](stories/S5.3-offline-mode.md) | Offline mode: the app and kept adventures without Wi-Fi | E5 | M7 | S0.9, S4.2, S3.4 | done |
| [S6.1](stories/S6.1-ebook-build.md) | Ebook build pipeline (EPUB + KF8) | E6 | M5 | S2.4 | done |
| [S6.2](stories/S6.2-ebook-content.md) | Ebook content (EN/FR) | E6 | M5 | S6.1 | done |
| [S6.3](stories/S6.3-ebook-download-page.md) | Ebook download page (desktop) | E6 | M5 | S6.1 | done |
| [S7.1](stories/S7.1-device-checklist-perf.md) | Real-device checklist & performance budgets | E7 | M5 | S4.2, S3.4 | done |
| [S7.2](stories/S7.2-launch.md) | Launch: domain, README, credits, licences | E7 | M5 | S7.1, S6.2, S6.3 | done |
| [S7.3](stories/S7.3-rendering-survey.md) | Rendering survey of the catalogue | E7 | M6 | S1.22 | done |
| [S7.4](stories/S7.4-story-file-scan.md) | Static scan of the catalogue's story files | E7 | M6 | S7.3 | done |
| [S7.5](stories/S7.5-release-notes-assets.md) | Release: ebooks and generated notes on the GitHub release | E7 | M5 | S6.1, S7.1 | in-progress |
