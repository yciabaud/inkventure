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
| **A — baseline** | Current Kindle (the device measured in S0.3) | Kindle "experimental browser" (modern engine behind an old WebKit user agent, see §2.2) | **Primary target.** Everything must work here. |
| B | Kobo (Clara, Libra, Sage), older Kindle firmware | Kobo / old Kindle WebKit browsers | **Best effort**, same build: the ES5 legacy bundle keeps JS running; layout may degrade (grid, custom properties). |
| C | PocketBook, Onyx Boox, tablets, desktop | Modern Chromium / WebKit | Supported + enhancements (offline cache, IndexedDB). |

### 2.2 Capabilities of the baseline browser

Measured with the capability probe ([S0.3](docs/stories/S0.3-kindle-capability-probe.md), served at `/probe/`;
raw reports in [docs/device-reports/](docs/device-reports/README.md)). First report: a current Kindle, 2026-09-29.

**What the Kindle measured** (experimental browser; CSS viewport 636×740 of a 636×848 screen, DPR 2):

- **Engine:** the user agent still says `AppleWebKit/531.2+ … Kindle/3.0+`, but the engine is modern: ES2015–2017
  syntax (arrow functions, classes, `let`/`const`, template literals, destructuring, spread, `for…of`,
  generators, `async`/`await`) and built-ins (`Promise`, `fetch`, `Map`/`Set`, `Symbol`, `Proxy`,
  `TextDecoder`, typed arrays, `Worker`) are native. **Missing:** optional chaining (`?.`) and WebAssembly.
  It loaded the **modern** (ES modules) bundle. `Intl` works (French number formatting included).
- **Network:** XHR `arraybuffer` works; the **IF Archive and its mirror send CORS headers** (game files can be
  downloaded directly); the IFDB JSON API is **blocked** (no CORS, as found in its source); IFDB cover
  thumbnails display.
- **Storage:** localStorage ≈ 4.75 M characters before `QuotaExceededError`, kept across sleep / wake **and survives
  a real device restart** (`run #6` after a restart, same first-run date). IndexedDB, Service Worker and the Cache API **exist** (whether they work reliably is still to be
  measured).
- **CSS:** flexbox (all syntaxes), grid, custom properties, `filter: grayscale`, `object-fit`, `calc`, `vw`,
  hyphens and `position: fixed` are all supported. Web fonts load, as **woff2**.
- **Input:** `ontouchstart` is **absent**, yet `touchstart` / `touchmove` / `touchend` and `pointerdown` events
  fire; `maxTouchPoints` reports 0. Feature-detect by listening to events, never by `'ontouchstart' in window`.
- **Performance:** ~50–80× slower than a desktop for a tight loop (1e6 iterations: 277–454 ms across two runs), but
  JSON is fast (153 KB parsed in 12–20 ms) and layout is acceptable (300 paragraphs in 70 ms). Home renders in ~1.1 s.

**Decision (2026-09-29): this Kindle is the baseline; very old e-readers are best effort.** Older Kindle firmware and
other e-readers (class B) may ship a genuinely old WebKit. The ES5 legacy bundle and the `es-check es5` gate stay
(they cost nothing on the baseline, which loads the modern bundle), but CSS grid and custom properties are now
allowed; problems on old devices are fixed case by case when reported. Other assumptions that remain:

- **Display:** 6"–10.2" e-ink, 16 gray levels, CSS viewport roughly 600×740 to 1240×1650, ghosting on partial
  refresh, slow repaint (≈100–500 ms).
- **Keyboard:** slow virtual keyboard covering half the screen; no hardware keys exposed to the page.
- **Offline:** not relied upon; Wi-Fi is needed to load the app and a game, but a loaded game keeps working and
  autosaves locally. A Service Worker offline shell is now a realistic enhancement (see §6.2 and §13).
- **CPU:** slow — interpreters must stay responsive (see [§4.5](#45-performance)).

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

A persistent top bar (like the Kindle header) shows: app name/Home, Library and a ⋯ Menu (icon buttons,
≥ 48 px); the menu holds Settings and Refresh screen. A focus outline is only drawn for keyboard focus
(`:focus-visible`), never after a tap. In the reader the bar is hidden until the top zone is tapped.

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
  one-line pitch in the UI language; a "Start here" badge on newcomer-friendly titles; then the best-rated games
  in the UI language. Only games in the UI language, and never one already in progress.
- Empty state (first launch: no game started or added): short welcome text, "How to play" link (`#/help`, a short
  paged guide that also offers the test adventure), Featured shelf first.
- The Featured shelf takes the height left on the screen: covers are sized to it (2:3, 96–204 px tall) and as many
  cards as fit side by side make a page. It loads only `catalog/featured.json`, not the index.
- Shelves are paginated horizontally with explicit ‹ › buttons, never scrolled.

### 3.4 Library (`#/library`)

Purpose: find the next adventure in the playable catalogue.

- **Search box**: title / author, matched client-side (accent- and case-insensitive; every word must start a word of
  the title or author), run on submit rather than on each keystroke (each redraw is an e-ink refresh).
- **Filters** (panel opened by a "Filters" button, "Filters (n)" when some are set; state reflected in the URL hash
  so the back button and a reload keep it):
  - Genre (IFDB genre, multi-select; spellings differing only by case merged)
  - Language (English, Français, Español… from the index facets, named in their own language)
  - Format / system (Z-machine, Glulx, Ink, Twine)
  - Minimum rating (★ 3+, 3.5+, 4+, 4.5+) and minimum number of ratings (5, 10, 25, 50)
  - Play time (< 30 min, 30 min–1 h, 1–2 h, 2 h+ — from IFDB median playtime when available)
  - Forgiveness (Merciful → Cruel; shown once the index carries it, see [§5.2](#52-catalogue-index))
  - Release year range
  - "Start here" (newcomer-friendly: a curated starter of `featured.json`, or an IFDB tag listed in
    `scripts/catalog/starter-tags.json`, e.g. *recommended for beginners*)

  Values are OR-ed within a filter and filters AND-ed; a game whose value is unknown (no rating, no play time) is
  left out by a filter on it. The panel replaces the results: a first page with the sort and one row per filter
  (its current value), and a page of choices per filter with counts, as many 56 px rows as fit, paged with ‹ ›.
  Choices apply at once and replace the current history entry, so "Show n adventures" returns to the results with
  them and the back button leaves the panel as the results were. Hash keys: `q`, `sort`, `genre`, `lang`,
  `format`, `rating`, `votes`, `time`, `fg`, `from`, `to`, `start`, `page`, `panel` (lists comma-separated).
- **Sort**: best rated (IFDB star sort; the default), most rated, newest, title A–Z; games without the value last,
  ties keep the search order (title matches first, then by title).
- **Results**, paginated, as many as fit the screen (no scrolling), in two views remembered in the preferences:
  - **Grid** (default, like the Kindle library): covers (IFDB thumbnail or typographic cover) with the title under
    each, on two lines at most, since cover art does not always show it (4 × 2 on a 600 × 800 e-reader);
  - **List**: small cover, title, then author, year, ★ rating (n), playtime, format (8 rows on 600 × 800).
  Tap → game detail.
- Only playable games appear (see [§5.2](#52-catalogue-index)). Result count shown ("214 adventures").

### 3.5 Game detail (`#/game/:tuid`)

- Cover, title, author(s), year, language, genre, format badge, ★ rating and count, playtime, forgiveness.
- Blurb (IFDB description, HTML sanitized to plain paragraphs, paginated if long: one CSS column per page, turned
  with the pager).
- Actions: **Play** (or **Continue** if a save exists), **Add to Home / Remove from Home**.
- "Experimental" / "May be slow on this device" notices when relevant (Twine, heavy Glulx).
- Credits: "Data from IFDB" link to the IFDB page, licence info when known (not in the catalogue yet), link to the
  file on the IF Archive.
- Loads `games/<tuid>.json` only (not the index), so a deep link opens fast on a cold start; a game no longer in the
  catalogue (404) says so and leads to the Library.

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
  on measured DOM heights with the current font settings, and re-paginates on settings change/orientation,
  keeping the reading position (the start of the page last turned to). Long paragraphs are split between lines,
  at a word start (no hyphenation in the reader).
- Tap zones: left 30 % = previous page, right 70 % = next page (Kindle convention); swipe left/right when
  supported. Page indicator "3 / 3" at the bottom.
- New output after a command opens on the page containing the echoed command; if output spans several
  pages, a "▸ more" marker invites turning the page. A turn (echoed command + reply) that does not fit in the rest of
  the page but fits on a page of its own starts a new page, so most replies are read whole, with the command bar.
- While the game waits for a command, its bare prompt (">") is not shown: the command field stands for it. The command bar is visible only on the **last** page
  (on earlier pages a short slot shows "Back to the present ›"). All pages share one text-area height; on the last
  page the taller command bar covers the bottom of it and the paginator gives that page less text, so earlier pages
  are not left with an empty band.
- `[MORE]` / "press any key" prompts from the game are satisfied by a tap on the page.

**Command input (parser games)** — a command bar of fixed height under the text on the last page (the text area
itself never changes size, see above), in three rows:

1. **Directions**: N, S, E, W, Up, Down, and ⋯ opening a dialog with all twelve directions (diagonals, In, Out).
2. **Verbs**: Look, Examine…, Take…, Inventory, and "More…" opening a dialog with Drop…, Open…, Talk to…, Wait, Again,
   Undo and the command history (previous / next). After a verb ending with "…" the verb goes into the field and this
   row shows **noun chips** instead (objects recently mentioned, guessed from the last paragraphs after their articles,
   excluding directions and the room name), plus ✕ to cancel; a noun chip completes and sends the command.

Rows never wrap nor cut a label: on narrow screens (phones), the directions and verbs that do not fit move, from the
end of the lists above, into the ⋯ and "More…" dialogs, and only the noun chips that fit are shown.
3. **Command field** + Enter; ↑ / ↓ browse the history. While it has focus the reader stays on the last page, so
   the virtual keyboard shrinking the page re-paginates without hiding the field.

- **Tapping a word** of the text on the last page puts it in the field, or completes and sends a waiting "Take …".
  (Taps on words therefore do not turn the page there; swipes and the margins still do.)
- Chip labels and commands follow the *game* language (EN/FR verified against the Inform libraries; ES/DE/IT stubs to
  verify), not the UI language; dialog titles and hints follow the UI language. The game language comes from the
  catalogue (English when unknown); `?lang=xx` on the route overrides it.

**Choice games (Ink / Twine)**

- Choices rendered as full-width numbered buttons under the text; no command bar.
- Same pagination rules; choices appear on the last page.

**Reader menu** (tap on status line or ⋯)

- Home · Library
- Aa: font size (6 steps, 14–28 px), typeface (serif / sans / "easy reading"), margins (3), line spacing (3),
  text alignment (left / justified) — saved as reader defaults (`prefs.reader`), or for one game only
  ("For this game only", stored in `progress:<tuid>.reader`). Every change re-paginates at once, keeping the reading
  position. "Easy reading" is a wide system sans with extra letter and word spacing: a real dyslexia font
  (OpenDyslexic, 128 KB as woff) does not fit the font budget (§10), which the owner decided not to raise.
- Save… (named slots, max 5 + autosave) · Restore… · Undo · Restart (confirm)
- Transcript (full, paginated, read-only) · Help (how to play, common commands) · Game info
  The Transcript view pages through the whole session (after a reload: the tail kept with the autosave), opens on the
  latest turn and has « Start, End » and "Back to the game" under every page; no command bar, taps on words do nothing.
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
  onExit(cb: () => void): void;                              // the story has ended (quit / end of story)
  onError(cb: (message: string) => void): void;              // fatal engine error
  sendLine(text: string): void;
  sendChar(key: string): void;
  choose(index: number): void;
  saveState(): Promise<Uint8Array>;   // between turns; Quetzal-based for Z/Glulx, ink JSON state for Ink
  restoreState(data: Uint8Array): Promise<void>;
  restart(): Promise<void>;
  undo(): Promise<boolean>;           // false: the reader restores its previous turn snapshot instead
}
```

For ZVM and Quixe, we implement a **GlkOte-compatible display layer** (the API Parchment's engines talk
to) that translates Glk window updates into `OutputBlock`s: buffer window → transcript, grid window →
status line, graphics → grayscale images, sound → ignored. Existing Parchment code is reused where its
licence allows (MIT); only the presentation layer is ours.

`OutputBlock` (`src/engines/engine.ts`): `paragraph` (styled runs, Glk style names; `append` continues the previous
paragraph, e.g. the echoed command after the prompt), `status` (the whole status line, one string per row) and `clear`
(ignored by the paginated transcript, which keeps everything). The Z-machine runs on ZVM (`ifvms`) and the Glk API
library `glkapi.js` (`glkote-term`), both MIT and pinned; small build-time patches let them run from an ES module
bundle, one Glk instance per game (see `src/engines/README.md`). `load()` rejects when the story cannot start; the VM
runs synchronously until it waits for input.

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
- Z-machine state: ZVM's own autosave snapshot (the RAM and stacks as a Quetzal file with uncompressed memory, plus the
  Glk library state, so a pending line input resumes), in a small JSON envelope naming the story; a plain Quetzal file
  can only be resumed by the game's own `@restore`. The game's SAVE / RESTORE commands are cancelled: saves go through
  the reader menu.
- A turn begins when the game waits for a command: its state is snapshotted (after the page is drawn) for Undo and
  written as the autosave with the transcript tail (the last 200 paragraphs with text, at most ≈ 20,000 characters),
  and the progress
  record is updated. Opening the game resumes from the autosave on the page of the last command. Restoring a slot
  resets Undo; Restart asks first, clears the autosave and keeps the named slots.
- A save is one storage entry: when the storage is full the write fails as a whole, the previous save stays intact and
  the Save dialog says so.

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
   (`downloadable:yes system:…` queries, `scripts/catalog/queries.json`), politely (≤ 1 request/s, `User-Agent` identifying the
   project, retries with backoff, incremental: only re-fetch games whose IFDB page version changed). Search pages
   hold 100 rows and leave hidden games out, so paging ends at the first empty page. The crawler also fetches each
   candidate's `viewgame?json` record (cached per game, keyed by page version) into `data/raw/games.json`.
2. **Resolve playability** (`scripts/catalog/resolve.ts`, offline) — from each candidate's `viewgame?json` record
   (fetched by the crawler) get links, formats, IFID, genre, language (primary subtag), tags, rating, play time, cover
   art (forgiveness is only in the iFiction XML, not fetched yet). Pick the best playable file among the formats
   enabled in `scripts/catalog/playability.json` (those with an engine): IF Archive URLs first, uncompressed before a
   zip (zips only when IFDB names the story file inside), `.zblorb/.gblorb` before bare story files; HTTPS only (IF
   Archive links upgraded). A file outside the IF Archive is used only if its host lets a browser page read it
   (CORS, checked by `check-cors.ts` before resolving, see [§5.5](#55-game-files)). Drop games without such a file,
   recording the reason in `report.json`.
3. **Apply content policy** ([§5.4](#54-content-policy)).
4. **Emit** static JSON into `public/catalog/`:
   - `meta.json` — build date, counts, facet values (genres, languages, formats) with counts.
   - `index-<n>.json` — compact rows sharded by ~500 games (short keys to keep parse time low on Kindle):
     `{t: tuid, n: title, a: author, y: year, l: lang, g: [genres], f: format, r: avgRating, rc: ratingCount,
     s: starSort, p: playtimeMin, fg: forgiveness, c: hasCover, sl: slowFlag, st: starterFlag}`, sorted by title;
     unknown values are left out (`fg` is not available from IFDB's JSON API yet; `st` marks the games carrying a
     newcomer-friendly IFDB tag of `scripts/catalog/starter-tags.json`).
   - `games/<tuid>.json` — full detail: blurb, credits, IFID, file URL(s), file size, licence, cover URL, IFDB link.
5. **Validate** — JSON schema checks, sizes budget (each shard < 150 KB), sanity counts vs previous build
   (fail if > 20 % drop).
6. **Deploy** — the weekly Catalogue workflow commits the files (and the crawler's record cache) to a `catalog`
   data branch; deployment and preview builds copy them into `public/catalog/` before building. The repository keeps
   a small sample catalogue there for development and tests.

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

Each item needs a one-line pitch (≤ 140 characters) for every UI locale; `starter` gives the "Start here" badge.
The curated file drives the game cards in the ebook and, with the ratings, the Home Featured shelf:

- **Published lists** — deployment and preview builds (`scripts/catalog/use-published.sh`) write
  `catalog/featured.json`: `{version, built, locales: {en: [...], fr: [...]}}`, one list per UI locale of index rows
  (same short keys as the shards, so Home needs no shard) plus `pi` (pitch) and `st` (starter). Each list holds the
  curated games **in that language** first, in file order, then the **best-rated games in that language** (IFDB star
  sort; average ≥ 3 stars; at most 24), so the shelf never shows a game the reader cannot read and stays full when
  the curation is thin. The sample catalogue has its own, from `tests/fixtures/featured.json`.
- **Validation** — CI (`scripts/catalog/check-featured.sh`) checks the curated file against the catalogue published
  on the `catalog` branch and fails on: bad schema, missing or overlong pitch, unknown tuid (or not playable),
  excluded by hand or carrying an adult tag ([§5.4](#54-content-policy)), game language not a UI locale. At
  deployment a curated game the catalogue no longer has is left out with a warning instead, so a withdrawn IFDB
  game never blocks a deployment.
- **Client** — the Home shelf shows the list of the UI locale **without the games already in progress** (a
  progress record or in *My adventures*), which is why the lists are longer than a shelf.

### 5.4 Content policy

- Build-time flag `CONTENT_POLICY=general` (V1 default): games carrying adult-content IFDB tags
  (configurable denylist in `scripts/catalog/content-policy.json`, e.g. `sexual content`, `adult`,
  `erotica`, `nsfw`) are excluded from the index. Also excluded from Featured validation.
- A future `CONTENT_POLICY=adult` build could produce a separate deployment (separate URL / ebook);
  no in-app toggle in V1.
- Risk: IFDB tagging is community-maintained and incomplete — a manual `exclude` list complements the tags.

### 5.5 Game files

- Downloaded at play time from the URL in `games/<tuid>.json` (IF Archive primarily).
- **Verified on a Kindle (S0.3):** `ifarchive.org` and `mirror.ifarchive.org` allow cross-origin reads, so story
  files are fetched directly. Fallbacks kept in case a file is hosted elsewhere or this changes: (1) another
  CORS-enabled mirror; (2) the pipeline mirrors files whose licence allows redistribution into `public/games/`
  (freeware/open licences only, recorded in the index); (3) a tiny, documented CORS relay (e.g. Cloudflare
  Worker) — last resort because it breaks "100 % static".
- **Other hosts are checked, not assumed** (found in S4.1 review: 207 of 1,693 games, 6 of 16 in French, had their
  only file on author sites, GitHub, web.archive.org…, most without CORS, so Play failed): the weekly build requests
  each such file with an `Origin` header (following redirects, each of which must allow it) and keeps the result for
  30 days in `cache/cors.json` on the `catalog` branch (network and 5xx errors are checked again the next week). Games
  whose file cannot be read leave the catalogue (`unreadable-host` in the report).
- Download (S3.4): XHR `arraybuffer` with a progress page (KB received, of the total when known; Cancel), abandoned
  after **30 s without receiving anything** (not a fixed total time: Wi-Fi can be slow). A zip is unzipped client-side
  (the `primary` file the catalogue names). The file must look like a story for its engine (Blorb or the format's
  header). Failures show an error page: Try again, Open on IFDB, Report a problem (a prefilled GitHub issue). Formats
  whose engine has not shipped yet say "Not playable yet" without downloading.
- Files are cached in localStorage only if small (< 512 KB after unzipping, deflated, keyed by file URL so a new
  version is re-downloaded; LRU, see §6); larger files are re-downloaded per session on Kindle. Caching a file only
  ever evicts other cached files, never saves.

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
| `ik:v1:home` | *My adventures*, most recently added first: `[{tuid, title, author, added, lastPlayed?}]` (title and author so Home needs no catalogue) |
| `ik:v1:progress:<tuid>` | `turns`, `lastPlayed`, `location`, per-game reader overrides (`reader`) |
| `ik:v1:save:<tuid>:auto` | latest autosave: `{v, date, turn, data, text}` (`data` = engine state, `text` = transcript tail, both deflated + base64) |
| `ik:v1:save:<tuid>:<slot>` | named save slots `1`–`5`, same record plus `name` |
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
  games. Feature-detected; never required. The Kindle measured in S0.3 exposes all three APIs, so this may reach
  class A too once it is shown to work there (§13 #11).

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
| Styles | Plain CSS (PostCSS + autoprefixer); flexbox, grid and custom properties allowed; no animations or transitions | Supported by the baseline Kindle (§2.2); e-ink has no use for motion. |
| Engines | ZVM + Quixe (Parchment, MIT), inkjs (MIT) | Mature, pure JS. |
| Unit tests | Vitest | Fast, TS-native. |
| E2E tests | Playwright | Device emulation, network mocking. |
| Hosting | GitHub Pages (project site, served from the `gh-pages` branch: `main` at the root, deployed by `.github/workflows/deploy.yml` after CI passes; each pull request under `pr-preview/pr-<n>/` by `preview.yml`) | Free, static; PRs can be tried on a device before merging. |
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
├── scripts/build/      build-info.ts: version.json + build meta tag (Vite plugin)
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

- `es-check es5` on the legacy build output (and the device probe), keeping very old e-readers running (best
  effort, §2.1); stylelint bans animations, transitions and other features useless or too new for e-ink. The baseline
  Kindle itself is covered by the modern-bundle e2e runs plus the device probe and checklist (§11.4).

### 11.4 Real-device checklist

- `docs/device-checklist.md` (story S7.1): a 15-minute manual script run on a real Kindle (and a Kobo)
  before each release; results recorded in the release notes.

---

## 12. Roadmap

| Milestone | Content | Stories |
|---|---|---|
| **M0 — Foundations & spikes** | Scaffold, CI, deploy, capability probe on Kindle, design system, i18n, storage, size budgets, PR previews | S0.1–S0.8 |
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
| 1 | Real capabilities of the Kindle browser. | **Measured** (S0.3, §2.2): modern engine, loads the modern bundle. localStorage persists across sleep / wake and a real device restart. Still open: swipe gestures in practice, older firmware / Kobo reports. Relax the ES5/CSS constraints only after more reports. |
| 2 | Does the IF Archive send CORS headers? | **Yes** (S0.3, main site and mirror): direct downloads; fallbacks in §5.5 kept. |
| 3 | IFDB API has no CORS. | **Confirmed live** on the Kindle (S0.3). Pre-built index (decided). |
| 4 | Glulx (Quixe) performance on Kindle CPUs. | Measure in S1.7; "may be slow" badge; possibly exclude very large games. |
| 5 | Twine games vary wildly; restyling may fail. | Experimental flag; curated allowlist if needed. |
| 6 | IFDB adult tagging incomplete. | Tag denylist + manual exclude list; report link. |
| 7 | IFDB / IF Archive load and etiquette. | Weekly incremental crawl, rate limiting, contact IFTF. |
| 8 | Licences of mirrored story files (if fallback 2 is needed). | Mirror only files with explicit free licences; record licence in index. |
| 9 | Kindle may clear localStorage. | Survives sleep / wake and a device restart (S0.3), but could still be cleared by the user or the browser. Export/import codes; prompt to export after N saves. |
| 10 | Virtual keyboard covering the screen on Kindle. | Chips-first design; test layout with keyboard open on device. |
| 11 | Offline on Kindle: Service Worker, IndexedDB and Cache API exist there. | Candidate follow-up story after M1: offline app shell + recently played games, validated on the device. |
