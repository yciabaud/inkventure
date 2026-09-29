# Inkventure — Product & Technical Specification

> Status: draft v0.1 · Last updated: 2026-09-29
> Backlog: [docs/BACKLOG.md](docs/BACKLOG.md) · Contributor workflow: [CLAUDE.md](CLAUDE.md)

Inkventure is a static web app that lets e-reader owners discover and play interactive fiction (IF)
from the [Interactive Fiction Database (IFDB)](https://ifdb.org), with an interface that feels like
reading a book on a Kindle. It is distributed through an ebook that introduces interactive fiction and
links straight into the app.

---

## Table of contents

1. [Vision & scope](#1-vision--scope)
2. [Target platforms & constraints](#2-target-platforms--constraints)
3. [Information architecture & screens](#3-information-architecture--screens)
4. [Game formats & engines](#4-game-formats--engines)
5. [Data sources & catalogue pipeline](#5-data-sources--catalogue-pipeline)
6. [Local storage](#6-local-storage)
7. [Internationalisation](#7-internationalisation)
8. [Ebook distribution](#8-ebook-distribution)
9. [Tech stack & repository layout](#9-tech-stack--repository-layout)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Testing strategy](#11-testing-strategy)
12. [Roadmap](#12-roadmap)
13. [Open questions & risks](#13-open-questions--risks)

---

## 1. Vision & scope

### 1.1 Goals

- **Play IF where people read.** Parser and choice-based games, playable in the web browser of an e-reader,
  with an ergonomic designed for e-ink: pages instead of scrolling, big tap targets, very little typing.
- **Help people find their next adventure.** A curated home screen plus a searchable, filterable
  library built from IFDB (genre, language, rating, length…), showing only games the app can actually run.
- **Zero backend.** Static files only (GitHub Pages). All player data stays on the device.
- **An ebook as the front door.** A free ebook (guide to IF + launcher) that e-reader owners can open
  on their device and tap into the app.

### 1.2 Non-goals (V1)

- User accounts, cloud sync, social features, reviews/ratings written from the app.
- Authoring tools.
- A native app or a Kindle "active content" app.
- Sound and colour graphics fidelity (images are shown in grayscale, sound is ignored).
- Adult content (hidden in V1 — see [§5.4](#54-content-policy)).

### 1.3 Personas

| Persona | Needs |
|---|---|
| **Curious reader** — owns a Kindle, never played IF | A gentle introduction (ebook), a short list of good starter games, help on how to type commands, no configuration. |
| **IF veteran** — knows Infocom / Inform games | Fast access to the full playable catalogue, filters, reliable saves, transcript, standard parser commands. |
| **French-speaking reader** | UI in French, and a way to filter French-language games. |

### 1.4 Design principles

1. **Kindle-inspired, not Kindle-branded.** Same calm, typographic, monochrome feel; no Amazon logos,
   icons, fonts or trade dress.
2. **E-ink first.** No animation, no transitions, no hover states, no infinite scroll, high contrast,
   minimal full-screen repaints.
3. **Tap before type.** Every frequent action is reachable by a tap; the keyboard is a fallback.
4. **Works on the weakest browser.** The Kindle experimental browser is the baseline; better devices get
   progressive enhancements.

---

## 2. Target platforms & constraints

### 2.1 Device classes

| Class | Examples | Browser | Support level |
|---|---|---|---|
| **A — baseline** | Kindle Paperwhite / Oasis / Basic / Scribe | Kindle "experimental browser" (old WebKit) | **Primary target.** Everything must work here. |
| B | Kobo (Clara, Libra, Sage) | Kobo WebKit browser (Beta features) | Supported, same build as A. |
| C | PocketBook, Onyx Boox, tablets, desktop | Modern Chromium / WebKit | Supported + enhancements (offline cache, IndexedDB). |

### 2.2 Assumed capabilities of the baseline browser

To be confirmed by the capability probe ([S0.3](docs/stories/S0.3-kindle-capability-probe.md)); until then we assume the worst:

- **JavaScript:** ES5 only. No native `Promise`, `fetch`, `class`, arrow functions, `Map/Set` guaranteed.
  → Ship a transpiled ES5 bundle with polyfills (Promise, Object.assign, Array helpers, etc.).
- **Network:** `XMLHttpRequest` (with `responseType = "arraybuffer"` to be verified).
- **Storage:** `localStorage` (≈5 MB, persistence across browser restarts to be verified).
  No reliable IndexedDB, Cache API or Service Worker → **no offline mode on Kindle**; Wi-Fi is needed to
  load the app and a game, but a loaded game keeps working and autosaves locally.
- **CSS:** flexbox (possibly old syntax), no CSS grid, no CSS variables guaranteed, limited web fonts.
- **Input:** touch (single tap reliable; swipe detection to verify), slow virtual keyboard that covers
  half the screen, no hardware keys exposed to the page.
- **Display:** 6"–10.2" e-ink, 16 gray levels, CSS viewport roughly 600×800 to 1240×1650,
  ghosting on partial refresh, slow repaint (≈100–500 ms).
- **CPU:** slow single core — interpreters must stay responsive (see [§4.5](#45-performance)).

### 2.3 Consequences for the whole app

- One HTML page, hash routing (`#/…`), no server rewrites.
- Small initial payload; catalogue and engines loaded on demand.
- Every screen is a static "page"; moving to the next page of content is an explicit tap.
- A **"Refresh screen"** action (forces a full black/white repaint to clear ghosting) in menus.

---

## 3. Information architecture & screens

### 3.1 Navigation map

```
#/home ─────────────┬──> #/game/:tuid ──> #/play/:tuid
  (Featured,        │         ▲
   My adventures,   │         │
   Continue)        │   #/library?q=…&genre=…&page=…
                    └──> #/library
#/settings  (UI language, reader defaults, data export/import/reset, about & credits)
```

A persistent top bar (like the Kindle header) shows: app name/Home, Library, Settings (icon buttons,
≥ 48 px). In the reader the bar is hidden until the top zone is tapped.

Deep links: `#/game/:tuid` and `#/play/:tuid` must work from a cold start (used by the ebook).

### 3.2 Visual language

- Pure black on white; grays only for secondary text and borders (≥ 4.5:1 contrast).
- Typography: a book serif for reading (bundled open font, e.g. Literata or Bitter, subset, with system
  serif fallback) and a sans for UI chrome. Base size 18 px, user adjustable in the reader.
- Covers: IFDB cover art in grayscale (CSS `filter: grayscale(1)` where supported, else as-is); games without
  art get a generated typographic cover (title + author on a patterned background), like Kindle's
  placeholder covers.
- Tap targets ≥ 48×48 px, 8 px spacing. No hover-only affordances. No transitions.
- Pagination controls ("‹ Prev  2 / 14  Next ›") instead of scrolling in lists.

### 3.3 Home (`#/home`)

Purpose: get back into a game in one tap, or start a recommended one.

- **Continue** hero: last played game — cover, title, "Turn 142 · last played 2 days ago", big **Continue** button.
  Hidden if no game started.
- **My adventures** shelf: games the player added from the library or started. Grid (covers) / list
  (title, author, progress) toggle; sort by *recent* or *title*; long-press or "⋯" menu → *Remove from Home*
  (keeps saves unless "also delete saves" is checked).
- **Featured** shelf: editorial selection from `featured.json` ([§5.3](#53-featured-selection)), each with a
  one-line pitch in the UI language; a "Start here" badge on newcomer-friendly titles.
- Empty state (first launch): short welcome text, "How to play" link, Featured shelf first.
- Shelves are paginated horizontally with explicit ‹ › buttons, never scrolled.

### 3.4 Library (`#/library`)

Purpose: find the next adventure in the playable catalogue.

- **Search box**: title / author, matched client-side (accent- and case-insensitive).
- **Filters** (panel opened by a "Filters" button; state reflected in the URL hash so the back button works):
  - Genre (IFDB genre, multi-select)
  - Language (e.g. English, Français, Español… from the index facets)
  - Format / system (Z-machine, Glulx, Ink, Twine)
  - Minimum rating (★ 3+, 4+…) and minimum number of ratings
  - Play time (< 30 min, 30 min–1 h, 1–2 h, 2 h+ — from IFDB median playtime when available)
  - Forgiveness (Merciful → Cruel)
  - Release year range
  - "Start here" (newcomer-friendly: featured or tagged)
- **Sort**: best rated (IFDB star sort), most rated, newest, title A–Z.
- **Results**: paginated list (10 per page on small screens), each row: small cover, title, author, year,
  ★ rating (n), format badge, playtime. Tap → game detail.
- Only playable games appear (see [§5.2](#52-catalogue-index)). Result count shown ("214 adventures").

### 3.5 Game detail (`#/game/:tuid`)

- Cover, title, author(s), year, language, genre, format badge, ★ rating and count, playtime, forgiveness.
- Blurb (IFDB description, HTML sanitized to plain paragraphs, paginated if long).
- Actions: **Play** (or **Continue** if a save exists), **Add to Home / Remove from Home**.
- "Experimental" / "May be slow on this device" notices when relevant (Twine, heavy Glulx).
- Credits: "Data from IFDB" link to the IFDB page, licence info when known, link to the file on the IF Archive.

### 3.6 Reader (`#/play/:tuid`)

The core screen. It must feel like reading an ebook.

**Layout**

```
┌──────────────────────────────────────┐
│ West of House            Turn 12  ⋯  │  ← status line (location · score/turns); tap zone = menu
├──────────────────────────────────────┤
│                                      │
│  You are standing in an open field   │
│  west of a white house, with a       │  ← paginated transcript (no scroll)
│  boarded front door.                 │
│                                      │
│  > open mailbox                      │
│  Opening the small mailbox reveals   │
│  a leaflet.                          │
│                                      │
├──────────────────────────────────────┤
│ [N][S][E][W][Look][Inv][Take…][More] │  ← shortcut chips (parser games)
│ > ______________________   [Enter]   │  ← command bar
└──────────────────────────────────────┘
                     3 / 3
```

**Pagination**

- Game output is laid out into pages that exactly fit the text area (no scrollbars). The paginator works
  on measured DOM heights with the current font settings, and re-paginates on settings change/orientation.
- Tap zones: left 30 % = previous page, right 70 % = next page (Kindle convention); swipe left/right when
  supported. Page indicator "3 / 3" at the bottom.
- New output after a command opens on the page containing the echoed command; if output spans several
  pages, a "▸ more" marker invites turning the page. The command bar is visible only on the **last** page
  (on earlier pages the bar shows "Back to the present ›").
- `[MORE]` / "press any key" prompts from the game are satisfied by a tap on the page.

**Command input (parser games)**

- Text field + Enter button; opening the keyboard must not break the layout (text area shrinks, pagination
  recalculated).
- **Shortcut chips** — tap-only play for most turns:
  - Compass: N, S, E, W, NE, NW, SE, SW, Up, Down, In, Out (collapsed into a compass popover on small screens).
  - Verbs: Look, Inventory, Examine…, Take…, Drop…, Open…, Talk to…, Wait, Again, Undo.
  - Verbs ending with "…" insert the verb into the field; then **noun chips** (recently mentioned nouns,
    extracted from the last outputs and the status line) complete it. Tapping a word in the transcript
    also inserts it into the command field.
  - Verb set is localised per *game* language (EN/FR/ES/DE/IT verb tables), not UI language.
- Command history (previous/next buttons in the "More" menu).

**Choice games (Ink / Twine)**

- Choices rendered as full-width numbered buttons under the text; no command bar.
- Same pagination rules; choices appear on the last page.

**Reader menu** (tap on status line or ⋯)

- Home · Library
- Aa: font size (6 steps), typeface (serif / sans / dyslexia-friendly), margins (3), line spacing (3),
  text alignment (left / justified) — persisted as reader defaults and per-game override.
- Save… (named slots, max 5 + autosave) · Restore… · Undo · Restart (confirm)
- Transcript (full, paginated, read-only) · Help (how to play, common commands) · Game info
- Refresh screen

**Status line**: location and score/turns from the game (Z-machine status line / Glk status window);
for choice games, the story title and chapter if provided.

---

## 4. Game formats & engines

### 4.1 Supported formats (V1)

| Format | Files | Engine | Notes |
|---|---|---|---|
| Z-machine | `.z3 .z4 .z5 .z8 .zblorb` | **ZVM** (Parchment project) | Infocom & Inform 6 games; lightest, first to ship. |
| Glulx | `.ulx .gblorb` | **Quixe** (Parchment project) | Most Inform 7 games. May be slow on Kindle (see §4.5). |
| Ink | compiled `.json` (ink story) | **inkjs** | Choice-based; rare on IFDB but ideal on e-ink. |
| Twine | `.html` (published story) | Game's own runtime, **sandboxed iframe** | Experimental; best-effort restyling. |

Out of scope V1: TADS, Hugo, ADRIFT, Alan, AGT, Quest, Adventuron, web-only games hosted on external sites.
Games whose only download is a `.zip` are supported if the zip contains exactly one supported story file
(unzipped client-side, or pre-resolved by the catalogue pipeline).

### 4.2 Engine abstraction

All engines implement one interface so the reader is engine-agnostic:

```ts
interface Engine {
  kind: 'zmachine' | 'glulx' | 'ink' | 'twine';
  load(story: ArrayBuffer | string, opts: EngineOptions): Promise<void>;
  onOutput(cb: (blocks: OutputBlock[]) => void): void;       // paragraphs, styles, status line, images
  onInputRequest(cb: (req: LineInput | CharInput | ChoiceInput) => void): void;
  sendLine(text: string): void;
  sendChar(key: string): void;
  choose(index: number): void;
  saveState(): Promise<Uint8Array>;   // Quetzal for Z/Glulx, ink JSON state for Ink
  restoreState(data: Uint8Array): Promise<void>;
  undo(): Promise<boolean>;
}
```

For ZVM and Quixe, we implement a **GlkOte-compatible display layer** (the API Parchment's engines talk
to) that translates Glk window updates into `OutputBlock`s: buffer window → transcript, grid window →
status line, graphics → grayscale images, sound → ignored. Existing Parchment code is reused where its
licence allows (MIT); only the presentation layer is ours.

### 4.3 Twine sandbox

- Story HTML loaded into `<iframe sandbox="allow-scripts">` from a `blob:`/`srcdoc` URL.
- An e-ink stylesheet is injected (black on white, serif, larger links, no animations) and a small script
  converts scrolling to pages where possible.
- Save/restore relies on the story format's own mechanism; Inkventure's save slots are disabled for Twine.
- Flagged "Experimental" in the UI.

### 4.4 Saves

- Z-machine / Glulx: in-memory Quetzal snapshots produced via the engine's save opcode (autosave after
  each turn), plus up to 5 named slots.
- Ink: `story.state.toJson()`.
- Undo: engine undo where available, else restore the previous autosave (keep last 10 turn snapshots in memory,
  last 1 on disk).

### 4.5 Performance

- Engines are loaded lazily per format (separate chunks).
- Long-running VM work is sliced (yield to the event loop every N ms) so taps stay responsive.
- Spike in M0 measures turn latency on a real Kindle for a small and a large Z game and a Glulx game.
  Targets: Z-machine turn < 1 s; Glulx turn < 3 s. Games above the threshold get the "May be slow" badge
  (heuristic: format + file size), computed at index time.

---

## 5. Data sources & catalogue pipeline

### 5.1 Why a pre-built index

Investigation of the IFDB source code ([iftechfoundation/ifdb](https://github.com/iftechfoundation/ifdb))
shows that its JSON API (`/search?json&searchfor=…`, `/viewgame?json&id=…`) returns
`Content-Type` and cache headers but **no `Access-Control-Allow-Origin`** header, so a browser page on
our domain cannot read it. Even if it could, live search over the network would be slow on an e-reader.

**Decision:** the catalogue is a **static index built by a scheduled GitHub Actions workflow** and
deployed with the app. The app never calls IFDB directly (only links to it).

### 5.2 Catalogue index

Pipeline (Node scripts in `scripts/catalog/`, run weekly and on demand):

1. **Crawl** — page through IFDB `search?json` for downloadable games, restricted per supported system
   (`downloadable:yes system:…` / `format:…` queries), politely (≤ 1 request/s, `User-Agent` identifying the
   project, conditional requests, incremental: only re-fetch games whose IFDB page version changed).
2. **Resolve playability** — for each candidate fetch `viewgame?json` (or `?ifiction` XML) to get links,
   formats, IFID, genre, language, forgiveness, tags, cover art. Pick the best playable file
   (prefer `.zblorb/.gblorb` over bare story files; prefer IF Archive URLs). Drop games without a
   supported file.
3. **Apply content policy** ([§5.4](#54-content-policy)).
4. **Emit** static JSON into `public/catalog/`:
   - `meta.json` — build date, counts, facet values (genres, languages, formats) with counts.
   - `index-<n>.json` — compact rows sharded by ~500 games (short keys to keep parse time low on Kindle):
     `{t: tuid, n: title, a: author, y: year, l: lang, g: [genres], f: format, r: avgRating, rc: ratingCount,
     s: starSort, p: playtimeMin, fg: forgiveness, c: hasCover, sl: slowFlag}`.
   - `games/<tuid>.json` — full detail: blurb, credits, IFID, file URL(s), file size, licence, cover URL, IFDB link.
5. **Validate** — JSON schema checks, sizes budget (each shard < 150 KB), sanity counts vs previous build
   (fail if > 20 % drop).
6. **Deploy** — commit to a `catalog` data branch or upload as a Pages artifact together with the app.

Client side: `meta.json` + index shards are loaded when the Library opens (with a "Loading catalogue…"
page), cached in memory, and in IndexedDB on class C devices. Filtering, sorting and search run over the
in-memory rows.

### 5.3 Featured selection

`content/featured.json`, hand-curated in the repo:

```json
{
  "version": 1,
  "items": [
    { "tuid": "…", "starter": true,
      "pitch": { "en": "A classic treasure hunt…", "fr": "Une chasse au trésor classique…" } }
  ]
}
```

Validated at build (every tuid must exist in the index and be playable). Drives the Home Featured shelf
and the game cards in the ebook.

### 5.4 Content policy

- Build-time flag `CONTENT_POLICY=general` (V1 default): games carrying adult-content IFDB tags
  (configurable denylist in `scripts/catalog/content-policy.json`, e.g. `sexual content`, `adult`,
  `erotica`, `nsfw`) are excluded from the index. Also excluded from Featured validation.
- A future `CONTENT_POLICY=adult` build could produce a separate deployment (separate URL / ebook);
  no in-app toggle in V1.
- Risk: IFDB tagging is community-maintained and incomplete — a manual `exclude` list complements the tags.

### 5.5 Game files

- Downloaded at play time from the URL in `games/<tuid>.json` (IF Archive primarily).
- **To verify in M0:** whether `ifarchive.org` (and its mirrors) serve `Access-Control-Allow-Origin`.
  Fallbacks in order: (1) another CORS-enabled mirror; (2) the pipeline mirrors files whose licence allows
  redistribution into `public/games/` (freeware/open licences only, recorded in the index); (3) a tiny,
  documented CORS relay (e.g. Cloudflare Worker) — last resort because it breaks "100 % static".
- Files are cached in localStorage only if small (< 512 KB, LRU, see §6); larger files are re-downloaded
  per session on Kindle.

### 5.6 Attribution & terms

- Every game detail links back to its IFDB page; "Catalogue data from IFDB" in About.
- Cover art is hot-linked from IFDB, not re-hosted, and always requested **as a thumbnail** sized for the slot
  (`coverart?id=…&thumbnail=WxH`, IFDB caps it at 250×250), never at full size — full-size covers can weigh
  hundreds of KB over e-reader Wi-Fi.
- Respect IFDB and IF Archive usage etiquette; contact the IFTF before launch to announce the project.

---

## 6. Local storage

### 6.1 Baseline: localStorage

All keys are prefixed and versioned:

| Key | Content |
|---|---|
| `ik:v1:prefs` | UI language, reader defaults (font, size, margins, spacing, align), list/grid choices |
| `ik:v1:home` | ordered list of tuids in *My adventures* with added/last-played dates |
| `ik:v1:progress:<tuid>` | turn count, last played, location, per-game reader overrides |
| `ik:v1:save:<tuid>:auto` | latest autosave (compressed, base64) |
| `ik:v1:save:<tuid>:<slot>` | named save slots (name, date, turn, data) |
| `ik:v1:file:<tuid>` | cached story file (small files only) |
| `ik:v1:lru` | access order for evictable entries |

- Saves are compressed (deflate via a small pure-JS lib) then base64-encoded.
- **Quota management:** every write goes through the storage layer; on `QuotaExceededError`, evict cached
  story files (LRU) first, then old autosaves of games not played for 90 days; never evict named saves
  silently — warn the user instead.
- **Schema migrations:** a `ik:schema` key and ordered migration functions.
- **Storage unavailable** (disabled site data, private mode): the app runs on an in-memory store and shows a
  non-blocking warning that progress will not be kept.

### 6.2 Enhancements (class C devices)

- IndexedDB for story files and catalogue shards; Service Worker for offline app shell + recently played
  games. Feature-detected; never required.

### 6.3 Export / import

- Settings → *Export my data*: produces a text code (compressed JSON of prefs, home, progress and saves, base64,
  chunked into groups for readability) and a downloadable `.txt` where downloads work.
- *Import*: paste a code; preview what will be replaced; merge or overwrite.
- Purpose: move saves between devices or protect against the browser clearing its storage.

---

## 7. Internationalisation

- UI strings in `src/i18n/<locale>.json`, EN and FR at launch: `{name}` interpolation (numbers formatted for the
  locale) and plurals written as `{ "one": …, "other": … }` chosen by the `count` parameter (CLDR rules: EN one = 1,
  FR one = 0–1). Missing keys fall back to EN; a unit test enforces key, message-kind and placeholder parity.
- Locale chosen from the browser's preferred languages (`navigator.languages` / `language`), overridable in
  Settings, persisted in prefs (`locale`); the choice is applied before the first render and sets `<html lang>`.
- Dates and numbers formatted with small helpers (no reliance on `Intl` on Kindle).
- The **game language** (Library filter, verb chips) is independent from the UI language.
- Featured pitches and ebook content are written per locale.

---

## 8. Ebook distribution

A free ebook, in EN and FR, is the main acquisition channel.

- **Content:** what interactive fiction is; how to play (typing commands, common verbs, compass, saving);
  how Inkventure works on your e-reader (Wi-Fi, experimental browser, exporting saves); a chapter of
  **game cards** from `featured.json` (cover, pitch, length, difficulty, **"Play now" link** to
  `https://<host>/#/play/<tuid>` + QR code); credits (IFDB, IF Archive, authors).
- **Formats:** EPUB 3 source built from Markdown in `ebook/`; KF8/AZW3 produced for Kindle
  (via Calibre `ebook-convert` in CI); PDF optional.
- **Distribution:** direct download (site, IF community), possibly free on stores; links must open the
  device browser (Kindle opens external links in the experimental browser after a confirmation).
- The ebook build reads `featured.json` so cards stay in sync with the app.

---

## 9. Tech stack & repository layout

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript | Safety across engines / storage / pipeline. |
| UI | Preact (+ hooks) | ~4 KB, works with ES5 transpilation. |
| Build | Vite + `@vitejs/plugin-legacy` (Babel, core-js polyfills) | Produces an ES5 legacy bundle for Kindle and a modern one for others. |
| Styles | Plain CSS (PostCSS + autoprefixer), flexbox only | No grid / custom properties dependency. |
| Engines | ZVM + Quixe (Parchment, MIT), inkjs (MIT) | Mature, pure JS. |
| Unit tests | Vitest | Fast, TS-native. |
| E2E tests | Playwright | Device emulation, network mocking. |
| Hosting | GitHub Pages | Free, static. |
| CI/CD | GitHub Actions | Tests, build, catalogue job, ebook build. |

```
/
├── SPEC.md, CLAUDE.md, README.md
├── docs/BACKLOG.md, docs/stories/*.md
├── src/
│   ├── app/            shell, hash router
│   ├── ui/             design-system components (TopBar, Button, Pager, Cover, Dialog…), icons
│   ├── screens/        home/, library/, game/, reader/, settings/
│   ├── reader/         paginator, command bar, chips
│   ├── engines/        engine.ts, glkote-bridge/, zvm/, quixe/, ink/, twine/
│   ├── catalog/        index loader, filters, search
│   ├── storage/        storage layer, migrations, export/import
│   ├── i18n/           en.json, fr.json, i18n.ts
│   └── styles/
├── size-budget.json    asset size budgets (checked by scripts/size/)
├── public/catalog/     generated index (not hand-edited)
├── content/featured.json
├── scripts/catalog/    crawler, resolver, emitter, content-policy.json
├── scripts/size/       check-size.ts: asset budgets report (CI)
├── ebook/              Markdown sources, templates, build script
└── tests/
    ├── unit/           (or colocated *.test.ts)
    ├── e2e/            Playwright specs
    └── fixtures/       tiny freely-licensed stories, recorded IFDB JSON
```

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Payload | Budgets in `size-budget.json`, enforced in CI by `npm run check:size` (S0.7): initial JS ≤ 150 KiB gz (legacy and modern), CSS ≤ 20 KiB gz, fonts ≤ 80 KiB as `.woff` (Kindle fallback) and ≤ 70 KiB as `.woff2`, each lazy chunk (engines…) ≤ 100 KiB gz, each catalogue shard ≤ 150 KiB, Kindle first load (legacy JS + CSS + `.woff`) ≤ 200 KiB. Cover images are requested as IFDB thumbnails (§5.6). |
| Speed (Kindle) | Home interactive < 3 s on Wi-Fi; page turn < 300 ms; Library first results < 4 s. |
| Compatibility | Legacy bundle passes `es-check es5`; no runtime errors in the capability-probe browsers. |
| Accessibility | Semantic HTML, labels on icon buttons, focus order, contrast ≥ 4.5:1, font scaling; dyslexia-friendly typeface option. |
| Privacy | No analytics, no third-party requests except IFDB cover art and game file hosts. No cookies. |
| Resilience | Clear error pages: game download failed (retry, open on IFDB), storage full (manage data), unsupported browser. |
| Licensing | App code open source (MIT proposed); third-party licences listed in About. |

---

## 11. Testing strategy

Tests are part of every story's definition of done; CI blocks merges when they fail.

### 11.1 Unit tests — Vitest

- Catalogue: filter combinations, sorting, pagination, search normalisation (accents, case).
- i18n: lookup, interpolation, plurals, fallback, **no missing keys** between locales.
- Storage: schema, migrations, quota handling & LRU eviction (mocked quota), export/import round-trip.
- Router: hash parsing/serialising of library filters.
- Paginator: text → pages for given sizes (jsdom with mocked measurements).
- Chips: noun extraction from outputs; verb tables per language.
- Engines: adapters run headless on tiny fixture stories (Z, Glulx, Ink): load, send command, expected output, save → restore.
- Pipeline scripts: run against **recorded IFDB JSON fixtures** (no live network in CI): playability
  resolution, format detection, adult-tag exclusion, shard/size budgets, featured validation.

### 11.2 End-to-end tests — Playwright

- Projects: `ereader-small` (≈600×800, touch, `reducedMotion`), `ereader-large` (≈1072×1448) on WebKit and
  Chromium; `desktop` smoke on Chromium. WebKit projects always run in CI; locally they are opt-in (`PW_WEBKIT=1`).
- Network mocked via `page.route`: catalogue fixtures, fixture story files instead of IF Archive, cover art stubbed.
- Scenarios (grow with the stories): Home Featured & My adventures; Library search, filters, sort,
  pagination, back button restores filters; Game detail → Add to Home → Play; play a Z-machine fixture
  (type a command, use chips, tap words, turn pages); Glulx and Ink fixtures; autosave + reload resumes;
  save/restore slots; undo; export/import code; UI language switch; deep link cold start `#/play/<tuid>`;
  storage-full and download-failure error pages.
- Optional screenshot comparisons for key screens (stable, since there is no animation).

### 11.3 Legacy-compatibility gate

- `es-check es5` on the legacy build output; stylelint rules banning `grid`, `var()`, and other unsupported
  features. This is the only automatable proxy for the Kindle browser — Playwright cannot emulate it.

### 11.4 Real-device checklist

- `docs/device-checklist.md` (story S7.1): a 15-minute manual script run on a real Kindle (and a Kobo)
  before each release; results recorded in the release notes.

---

## 12. Roadmap

| Milestone | Content | Stories |
|---|---|---|
| **M0 — Foundations & spikes** | Scaffold, CI, deploy, capability probe on Kindle, design system, i18n, storage, size budgets | S0.1–S0.7 |
| **M1 — Playable Z-machine** | Paginated reader, settings, ZVM, command bar & chips, saves, status line | S1.1–S1.6 |
| **M2 — Catalogue pipeline** | IFDB crawl, playability, index, featured | S2.1–S2.4 |
| **M3 — Library & Home** | Library, game detail, file loader, Home shelves, settings & export | S3.1–S3.4, S4.1–S4.2, S5.1–S5.2 |
| **M4 — More formats** | Glulx, Ink, Twine | S1.7–S1.9 |
| **M5 — Ebook & launch** | Ebook build & content, device checklist, launch | S6.1–S6.2, S7.1–S7.2 |

Details and dependencies: [docs/BACKLOG.md](docs/BACKLOG.md).

---

## 13. Open questions & risks

| # | Question / risk | Plan |
|---|---|---|
| 1 | Real capabilities of the Kindle browser (ES level, XHR arraybuffer, localStorage persistence, swipe). | Capability probe S0.3 on real devices, update §2.2. |
| 2 | Does the IF Archive send CORS headers? | Check in S3.4 (and S0.3 from a device); fallbacks in §5.5. |
| 3 | IFDB API has no CORS (verified in source, to confirm live). | Pre-built index (decided). |
| 4 | Glulx (Quixe) performance on Kindle CPUs. | Measure in S1.7; "may be slow" badge; possibly exclude very large games. |
| 5 | Twine games vary wildly; restyling may fail. | Experimental flag; curated allowlist if needed. |
| 6 | IFDB adult tagging incomplete. | Tag denylist + manual exclude list; report link. |
| 7 | IFDB / IF Archive load and etiquette. | Weekly incremental crawl, rate limiting, contact IFTF. |
| 8 | Licences of mirrored story files (if fallback 2 is needed). | Mirror only files with explicit free licences; record licence in index. |
| 9 | Kindle may clear localStorage. | Export/import codes; prompt to export after N saves. |
| 10 | Virtual keyboard covering the screen on Kindle. | Chips-first design; test layout with keyboard open on device. |
