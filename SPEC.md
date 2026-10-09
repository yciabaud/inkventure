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
  autosaves locally. **Measured (S0.9, 2026-10-02):** a Service Worker serves a page with Wi-Fi off, after a browser
  and a device restart; the Cache API and IndexedDB keep files of up to 20 MB across both (quota 100 MB,
  `persist()` refused, `estimate()` under-reports usage). **Offline mode (S5.3, §6.2):** the app shell is kept by a
  Service Worker and adventures can be kept on the device, so a kept adventure plays with Wi-Fi off.
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
#/settings  (UI language, reader defaults, storage usage & reset, about & credits)
```

Settings keeps every page scroll-free: its first page holds the UI language (Automatic / English / Français) and
links to one page per section, `#/settings?s=reading` (reader defaults, with a preview), `?s=offline` (adventures
kept on the device, with their sizes and *Remove from device*, S5.3), `?s=data` (storage usage, reset) and `?s=about`
(version, credits, privacy).

A persistent top bar (like the Kindle header) shows: app name/Home, Library and a ⋯ Menu (icon buttons,
≥ 48 px); the menu holds Settings, Free ebook (the download page, `ebook/`) and Refresh screen. A focus outline is only drawn for keyboard focus
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
- **My adventures** shelf: games the player added from the library or started (a game is added on its first turn,
  again if it was removed). A grid of covers like the Library's (as many rows and columns as fit), last played (or
  added) first; no list view or sort on Home (decided in S4.2 review:
  too much for a shelf). A "⋮" over the bottom right corner of each cover, like the Kindle library, opens the game's
  menu: the game (cover, title, author, progress), then Continue / Play, its page, *Keep offline* or *Remove from
  device* (S5.3, §6.2), *Remove from Home* (keeps saves and progress unless "also delete saves" is checked; the cached
  or kept story file stays either way).
- **Offline** (S5.3): Home runs on local data. An adventure that is not kept shows a "Needs Wi-Fi" badge (and the
  Continue hero a "Needs Wi-Fi" button instead of Continue) and cannot be started; the Featured shelf, which needs the
  catalogue, says "Offline: connect to browse the catalogue".
- **One shelf at a time** (so its covers can be large): when the player has adventures and there are featured games,
  a tab row "My adventures | Featured" replaces the shelf title (`#/home?shelf=featured`, replaced in the history);
  the shelf takes the height left under the hero, with a compact "‹ 2 / 5 ›" pager on the same header row (without
  the page number on narrow screens). Both shelves use the same multi-row grid as the Library (title under each
  cover, covers spaced evenly up to the screen edges), so covers have the same size in both tabs.
- **Featured** shelf: editorial selection from `featured.json` ([§5.3](#53-featured-selection)), a "Start here" badge
  on newcomer-friendly titles (their one-line pitch is not shown on Home since S4.2, where the grid leaves room for
  the title only; it stays for the ebook cards); then the best-rated games
  in the UI language. Only games in the UI language, and never one already in progress.
- Empty state (first launch: no game started or added): short welcome text, "Get the free ebook" link (the download
  page, `ebook/`), "How to play" link (`#/help`, a short
  paged guide that also offers the test adventure), Featured shelf first.
- The Featured shelf takes the height left on the screen: covers are sized to it (2:3, 96–250 px tall, the
  largest IFDB thumbnail) and as many
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
  - Illustrated (games whose story file holds pictures besides the cover, see [§5.2](#52-catalogue-index); S2.5): a
    single yes choice with its count, shown once the catalogue has illustrated games
  - "Start here" (newcomer-friendly: a curated starter of `featured.json`, or an IFDB tag listed in
    `scripts/catalog/starter-tags.json`, e.g. *recommended for beginners*)

  Values are OR-ed within a filter and filters AND-ed; a game whose value is unknown (no rating, no play time) is
  left out by a filter on it. The panel replaces the results: a first page with the sort and one row per filter
  (its current value), and a page of choices per filter with counts, as many 56 px rows as fit, paged with ‹ ›.
  Choices apply at once and replace the current history entry, so "Show n adventures" returns to the results with
  them and the back button leaves the panel as the results were. Hash keys: `q`, `sort`, `genre`, `lang`,
  `format`, `rating`, `votes`, `time`, `fg`, `from`, `to`, `ill`, `start`, `page`, `panel` (lists comma-separated).
- **Sort**: best rated (IFDB star sort; the default), most rated, newest, title A–Z; games without the value last,
  ties keep the search order (title matches first, then by title).
- **Results**, paginated, as many as fit the screen (no scrolling), in two views remembered in the preferences:
  - **Grid** (default, like the Kindle library): covers (IFDB thumbnail or typographic cover) with the title under
    each, on two lines at most, since cover art does not always show it (4 × 2 on a 600 × 800 e-reader);
  - **List**: small cover, title, then author, year, ★ rating (n), playtime, format (8 rows on 600 × 800).
  Tap → game detail.
- Only playable games appear (see [§5.2](#52-catalogue-index)). Result count shown ("214 adventures").

### 3.5 Game detail (`#/game/:tuid`)

- Cover, title, author(s), year, language, genre, format badge, "Illustrated" badge when relevant, ★ rating and count, playtime, forgiveness.
- Blurb (IFDB description, HTML sanitized to plain paragraphs, paginated if long: one CSS column per page, turned
  with the pager).
- Actions: **Play** (or **Continue** if a save exists), **Add to Home / Remove from Home**; under them **Keep offline**
  (downloads the story, keeps it with the page data and adds the game to Home; S5.3), or, once kept, its size and
  **Remove from device**. Offline, a kept game's page opens from its kept copy; a game that is not kept shows "Needs
  Wi-Fi" instead of Play.
- **Language** (S2.6), for a game with a file per language: one button per language; Play, Continue, Home, the
  language shown and the IF Archive link follow the chosen one. The page opens on the language a link names
  (`#/game/<tuid>-<lang>`), else the one last played, else the UI language, else the default file's.
- "Experimental" / "May be slow on this device" notices when relevant (Twine; no game is flagged slow for now, §4.5).
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
  at a word start, or after a hyphen inside a word, where the browser breaks lines too (no hyphenation in the
  reader). Spaces are kept as the game printed them (an indented line, two spaces after a full stop), and lines still
  wrap (S1.18). A line laid out for the game's 80-column screen with 8 leading spaces or more (S1.23) is shown as the
  game meant it on any width: centred when its margins are about equal (a title, "[Press SPACE to begin.]"), its indent
  dropped when it is wider than 80 columns, else its indent as a share of the text column (`text-indent` in %), so a
  narrow screen never wraps a run of spaces onto a line of its own.
- Tap zones: left 30 % = previous page, right 70 % = next page (Kindle convention); swipe left/right when
  supported. Page indicator "3 / 3" at the bottom.
- New output after a command opens on the page containing the echoed command; if output spans several
  pages, a "▸ more" marker invites turning the page. A turn (echoed command + reply) that does not fit in the rest of
  the page but fits on a page of its own starts a new page, so most replies are read whole, with the command bar.
- Text a game prints **on a timer** while it waits (S1.25: a countdown, text that appears by itself, §4.2) goes at the
  end of the text, like a turn's, without moving the reader off the page being read; status rows change in place.
- While the game waits for a command, its bare prompt (">") is not shown: the command field stands for it. The command bar is visible only on the **last** page
  (on earlier pages a short slot shows "Last page ›", which opens it). All pages share one text-area height; on the last
  page the taller command bar covers the bottom of it and the paginator gives that page less text, so earlier pages
  are not left with an empty band.
- **Cleared screens**: when the game clears its main window (a menu, a title, a new chapter), the text after it opens
  on a fresh page, and the pages open on it at once (no "Last page" step when it fits on one page). A screen
  reached by key presses only (no command typed in it: a menu being browsed, a title page) is **replaced** by the next
  one: browsing a menu never adds pages, and after it only the game's earlier pages and the new screen remain. The
  Transcript view still shows the replaced screens, each on a page of its own; saves keep where screens start, not the
  replaced screens. The command that opened a cleared screen stays at the end of the text before it (Glk drops its
  echo with the window: the reader puts it back).
- **Single-key prompts** (the game waits for one key): the slot under the text shows chips for the **keys the text
  names** ("Press N to begin", "R to restore", "Choose option 1 or 2", "Y/N", numbered options, a menu legend
  "N = Next  Q = Quit Menu"), read from the paragraphs since the last command and from every status row, in the order
  found, at most 8, each with a short label when the text gives one ("N — Next"). Under them, always, **Continue ›**
  (Return, or a space when the game asks for the space bar) and **Key…**, a one-character field (virtual keyboard) that
  sends the first character typed. Letters are sent in lower case. `[MORE]` / "press any key" prompts, where no key is
  named, are also satisfied by a tap on the page.

**Command input (parser games)** — a command bar of fixed height under the text on the last page (the text area
itself never changes size, see above), in three rows:

1. **Directions**: N, S, E, W, Up, Down, and ⋯ opening a dialog with all twelve directions (diagonals, In, Out).
   When the game asks a question in its text (S1.17), its **answers** come first in this row, in bold, and the
   directions that no longer fit move to the dialog: **Yes / No** (game language) when the last paragraph before the
   prompt asks a yes/no question to the player (it ends with "?" and starts with an auxiliary verb with "you" / "I" /
   "we" in it, or a French inversion "Voulez-vous…", or says "yes or no", "(y/n)", "oui ou non"); the **numbers** of
   a numbered list of options that ends the text ("1. …", "1) …", "(1) …", from 1, in order, at least two, at most 9
   chips, optionally followed by one short line asking for the choice), each with the start of its option when all
   of them fit, the number alone otherwise. A tap sends the answer. A list wins over a yes/no question.
2. **Verbs**: Look, Examine…, Take…, Inventory, and "More…" opening a dialog with Drop…, Open…, Talk to…, Wait, Again,
   Undo and the command history (previous / next). The **commands the game names in capitals** (S1.19) come first in
   this row, in bold (at most 4; the verbs that no longer fit move to "More…"): runs of 1–3 capital words of 2+ letters
   (optionally a number, "PS 1") in the text since the last command, when announced ("type", "try", "enter", "use",
   "tapez", "essayez"…, or listed after one in the same sentence: "type WAKE UP …, or LOGBOOK"), marked (quotes,
   `[ ]`, `* *`, `( )`), followed by "command" / "commande", or followed by a placeholder ("TALK TO someone": the
   chip fills the field instead of sending); a usual meta command alone (HELP, HINTS, ABOUT, CREDITS, GUIDE, AIDE…)
   needs no signal. Never: a paragraph all in capitals, a heading, the room name and status rows, Roman numerals,
   what the bar already has, nor SAVE / RESTORE / RESTART / QUIT / UNDO (the menu has them). A chip shows the command
   as written and sends it in lower case. After a verb ending with "…" the verb goes into the field and this
   row shows **noun chips** instead (objects recently mentioned, guessed from the last paragraphs after their articles,
   excluding directions and the room name), plus ✕ to cancel; a noun chip completes and sends the command.
   When the last paragraph before the prompt is the **parser asking for an object** (S1.21), this row shows noun
   chips too, without a verb in the field: the options the question names (in order, without their articles, at most
   8), else the objects recently mentioned; a tap sends the **noun alone**, which the parser takes to complete its
   command; ✕ brings the verbs back for that turn. Recognised: the Inform 6 / Inform 7 forms of the game language's
   phrase table (EN: "What / Whom do you want [X] to …?", "Which exactly?", "Which / Who do you mean, the X or the Y?";
   FR: "Que / Qui / À qui … voulez-vous … ?", "Lequel (voulez-vous) exactement ?", "Précisez : le X ou le Y ?",
   "Voulez-vous dire le X ou le Y ?", "Pouvez-vous préciser … ?"); and, in any language, a short question alone after
   the command that lists objects sharing a word with it ("examine coat" → "…, the red coat or the blue coat?"), or
   that follows a verb of the bar sent alone ("examine" → "…?", not a yes/no question). When the question does not say
   what it is for ("Pouvez-vous préciser ?", or the second case without a phrase), the command comes first as a chip
   ending with "…" ("open…"): a noun chip sends it with the noun ("open door"), and the chip itself puts the command in
   the field. A parser question wins over answer chips and named commands. The whole paragraph (or its last line)
   must be the question, so a question in the prose or a character's line does not count.

**Languages of the heuristics** — the chips that read the game's text (answers, named commands, parser questions)
use one algorithm for every language; the words they look for are data, one phrase table per game language
(`src/reader/commands/phrases.ts`: Yes / No, "or", articles, the auxiliaries of a yes/no question, cue words, meta
and reserved commands, the library's questions). A game's table gets the English words a game prints as they are
(meta commands, library messages), never English grammar. EN and FR are checked against the Inform libraries and the
featured games; ES, DE and IT are stubs to verify, which also rely on the signals that need no words.

Rows never wrap nor cut a label: on narrow screens (phones), the directions and verbs that do not fit move, from the
end of the lists above, into the ⋯ and "More…" dialogs, and only the noun chips that fit are shown.
3. **Command field** + Enter; ↑ / ↓ browse the history. While it has focus the reader stays on the last page, so
   the virtual keyboard shrinking the page re-paginates without hiding the field.

- **Tapping a word** of the text on the last page puts it in the field, or completes and sends a waiting "Take …".
  (Taps on words therefore do not turn the page there; swipes and the margins still do.)
- Chip labels and commands follow the *game* language (EN/FR verified against the Inform libraries; ES/DE/IT stubs to
  verify), not the UI language; dialog titles and hints follow the UI language. The game language comes from the
  catalogue (English when unknown); `?lang=xx` on the route overrides it.

**Choice games (Ink)** — Twine stories draw their own links in their frame (§4.3).

- Choices rendered as full-width numbered buttons under the text; no command bar.
- Same pagination rules; choices appear on the last page (the slot under the text grows to the list's measured height,
  at most 60 % of the screen). The choice made is shown in bold in the text, like an echoed command.

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
for choice games, the story title and chapter if provided. Every non-empty row of the status window shows in the top
zone, one under the other in the UI font, each split like the first into a left part and a right part (region and
exits, progress counters, a menu's legend); blank rows are dropped. Past 4 rows, the zone shows the first 3 and a "…"
line, and the reader menu lists them all (a box under the status line is shown in the text, below). A row the game centred (a title) stays centred; an indented row is one
left part. The text area gets shorter by the zone's height: when the number of rows changes, the pages are laid out
again at once, keeping the reading position, and all pages (earlier ones too) share the new text-area height.

**Menus drawn in the upper window** (S1.22, like Lost Pig's HELP): while the game waits for a key, its main window
cleared with nothing printed since, and its upper window has more than 4 non-empty rows, those rows take the text
area as a screen of their own, redrawn in place at each key (no page added): one paragraph per row, a centred row
centred, the selected entry (marked "> ") in bold, a legend's two parts on one line. The top zone shows only the first
row when it is a centred title (else the game's title). The key chips (S1.12) are unchanged. When the game goes back to
its main window (a subject opened, the menu closed), the reader shows it as before, on a fresh page (S1.16). These
screens are not in the Transcript view (they are the status window, not the game's text).

**Boxes drawn in the upper window** (S1.23, Inform's `box`: an epigraph, a title card): outside those menus, rows under
the status line, after a blank row and all indented (a box is centred; a map or a list of exits starts at the margin),
are a box. The top zone keeps the status line (the rows above the blank one; none for an opening epigraph), and the
text area shows the box at the start of the turn (after the echoed command, or opening the screen when the game cleared
its window), as the window sits above the turn's text: one centred paragraph per group of rows (blank rows set the
spacing), one line per row, in the reading font. When the game redraws its upper window without it, the box stays
there in the text, the Transcript view and the saves. Rows drawn again after a command are a part of the status window
(Metamorphoses' humours), not a box: they go back to the top zone. In Glulx, the library's quote box is a text window
of its own: the text of any buffer window other than the main one (the one asking for input) is shown the same way.
No box is kept while the main window is cleared and empty (a menu), nor a box another box replaces on a timer: those
are the frames of an animation (Shrapnel's title, S1.25), shown one at a time, and only the last one stays.

---

## 4. Game formats & engines

### 4.1 Supported formats (V1)

| Format | Files | Engine | Notes |
|---|---|---|---|
| Z-machine | `.z3 .z4 .z5 .z8 .zblorb` | **ZVM** (Parchment project) | Infocom & Inform 6 games; lightest, first to ship. |
| Glulx | `.ulx .gblorb` | **Quixe** (Parchment project) | Most Inform 7 games. Turns up to ~3 s on a Kindle (see §4.5). |
| Ink | compiled `.json` (ink story), or Inky's web export (zip or page) holding it | **inkjs** | Choice-based; ideal on e-ink. Most are on itch.io only (out of scope). |
| Twine | `.html` (published story) | Game's own runtime, **sandboxed iframe** | Experimental; best-effort restyling. |

Out of scope V1: TADS, Hugo, ADRIFT, Alan, AGT, Quest, Adventuron, web-only games hosted on external sites.
Games whose only download is a `.zip` are supported if the zip contains exactly one supported story file
(unzipped client-side, or pre-resolved by the catalogue pipeline).
**Ink web exports** (S2.7): authors of ink games rarely publish the compiled `.json`; they publish Inky's *Export for
web* (`index.html`, `ink.js`, `main.js` and the story in a script, `var storyContent = {…};`, usually named after the
project), zipped on the IF Archive or as a page. The app plays the compiled story it holds with its own choice
buttons; the export's scripts and styles are never run, so an export whose `main.js` adds behaviour the story relies
on (external functions, custom tags) may not play fully.

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
  imageUrl?(image: number): string | null; // data URL of a picture of the story (Glulx Blorb), or null
  setTimersActive?(active: boolean): void;  // timer events on/off (Z-machine, Glulx: off while the game is not shown)
}
```

For ZVM and Quixe, we implement a **GlkOte-compatible display layer** (the API Parchment's engines talk
to) that translates Glk window updates into `OutputBlock`s: the main buffer window → transcript, another buffer
window → a box (§3.6, S1.23), grid window → status line, pictures drawn in the buffer window → grayscale images, graphics windows and sound → ignored. Existing Parchment code is reused where its
licence allows (MIT); only the presentation layer is ours.

`OutputBlock` (`src/engines/engine.ts`): `paragraph` (styled runs, Glk style names; `append` continues the previous
paragraph, e.g. the echoed command after the prompt), `status` (the whole status line, one string per row), `image`
(a picture on a line of its own: its Blorb number, size in px and alt text; the text around it on the same Glk line
becomes the paragraphs before and after it), `clear` (the main window was cleared: the next paragraph starts a new screen, §3.6) and `quote` (the lines of another buffer window, none when it closes: a box, §3.6; a `paragraph` with `box` restores a kept box from a save). The Z-machine runs on ZVM (`ifvms`) and the Glk API
library `glkapi.js` (`glkote-term`), both MIT and pinned; small build-time patches let them run from an ES module
bundle, one Glk instance per game (see `src/engines/README.md`), and keep bit 1 of the header's Flags 1 in versions 4
and later, which the Inform library reads as a time game ("Time: 9:05 am"), as upstream ZVM does since 1.1.6 (S1.18). `load()` rejects when the story cannot start; the VM
runs synchronously until it waits for input. Glulx runs on Quixe 2.2.6 with its own, newer Glk library and Blorb decoder,
downloaded unchanged at install time from the upstream `quixe-2.2.6` tag into `vendor/quixe/` (Quixe is not on npm;
the files are checked against SHA-256 hashes kept in the repository, and ignored by git) and patched at build time; `.gblorb` files are unpacked
client-side. Its runs are time-sliced (§4.5), so `load()` resolves when the game first waits for input.
**Timers** (S1.25): the bridge declares GlkOte's `timer` support and sends the timer events a game asks for
(`glk_request_timer_events`), at its interval but **never more often than once a second** (on e-ink each event may
redraw the screen: a 10 ms animation gets one frame a second), and only while the VM waits for an event and the reader
shows the game (not in the Transcript view, a dialog, with the page hidden, nor after leaving the reader; back on, the
next event comes a full interval later). ZVM leaves out the Z-machine's timed input (`@read` / `@read_char` with a time
in tenths of a second and a routine): the adapter adds it to each VM (`src/engines/zvm/timedInput.ts`): the time goes
to Glk as a timer; at each event the routine runs nested in the waiting VM (a line request is cancelled meanwhile,
without echo, so the routine can print, and asked again after); when it returns true the input ends (terminator 0 or
key 0). It also stores Return as terminator 13 (ZVM stored glkapi's 0, which a game would read as ended by its
routine). The interval is in ZVM's and Glk's saved state, so a restored game ticks again. Pictures
drawn in the main window (`glk_image_draw`, from the Blorb's `Pict` chunks) are shown: the bridge passes the picture's
number, size and alt text (Blorb `RDes`), and `imageUrl` gives its data (a `data:` URL built by Quixe's Blorb decoder).
The paginator sizes a picture from its known size before it loads (scaled down to the text column and to the room on
the last page, under the command bar, keeping its proportions), so pages never reflow; it is shown in grayscale (CSS
filter) and never split across pages. A picture with no data shows its alt text in a box of its size. Graphics windows
are still not drawn; sound is ignored. Ink runs on inkjs 2.4 (runtime only): each stop is a
`ChoiceInput`; the `title` global tag and `chapter` line tags make the status line; external functions fall back to
the ink functions of the same name.

### 4.3 Twine sandbox

- Story HTML loaded into `<iframe sandbox="allow-scripts">` from `srcdoc`: scripts run, but with an opaque origin, so
  the story cannot reach the app's page, its storage, cookies or the top window, nor open pop-ups.
- An e-ink stylesheet is injected first in its `<head>` (black on white, the reader's text settings with system fonts,
  bold underlined links at least 48 px tall and always opaque, no motion: animations and transitions are not removed but
  made instant, so they jump to their end state, which a story that fades its text in from `opacity:0` needs to show
  at all; SugarCube's UI bar and Harlowe's sidebar restyled, a stowed UI bar
  leaving its whole toggle (≥ 48 px) in the frame; readable colours: every element of the story, its
  `::before` and `::after` in black, over the story's own `!important` rules, with no background colour, and no
  background image on links and controls; pictures stay: `img`, `svg`, `canvas`, `video` and a `url(…)` background
  elsewhere; the frame script clears a gradient behind text and turns visible borders black, a
  transparent one stays; dialogs, overlays and UI bars stay opaque white; disabled controls grey; a link drawn only with symbols the device
  has no font for, which would show empty boxes, is labelled with the passage it leads to, or "Link"), and a small script turns pages: a tap on the left 30 % of the frame (outside links and controls) shows the
  previous screenful, elsewhere the next one (one line of overlap), and the page number shows under the frame.
  Scrolling is hidden only once that script runs, so a story that breaks it still scrolls. "Aa" changes are sent to
  the frame as a new stylesheet (the story is not reloaded). Relative links (images) resolve where the story was
  downloaded from (`<base>`).
- **A story from a zip** (S1.11) keeps, besides its page, the files of the page's folder the frame can use (pictures,
  fonts, styles, scripts; not audio or video), at most 8 MB unpacked, in their order of reference (the rest is
  dropped, with a console warning). Before the frame loads, the page's references to them (attributes, `url(…)` in
  styles, `@import`, SugarCube `[img[…]]`, also in the passages' text; `./`, `../`, `%20` normalised, case ignored as a
  fallback) become `data:` URLs, which load in the opaque origin, fonts included; linked stylesheets and scripts are
  inlined; a font keeps only its first source found in the zip. References the story makes later (`src` of an image,
  `url(…)` in a `style` attribute) are sent by the frame script to the reader, which answers with a `data:` URL when
  they name a kept file. Other references still go through `<base>`.
- Save/restore relies on the story format's own mechanism; Inkventure's Save, Restore, Undo and Transcript are not
  offered for Twine. The sandbox has no storage of its own: the injected script stands in for `localStorage` and
  `sessionStorage` and sends every change to the reader, which keeps it under `save:<tuid>:twine` (at most 1 M
  characters; a named-save entry: never evicted). So the format's save slots persist and a SugarCube story resumes
  where it was after a reload. Restart reloads the story, keeping its `localStorage` (its saves) and dropping its
  session; its dialog also offers "Erase everything and restart", which drops the `localStorage` too (a story that
  saves by itself then really starts afresh instead of asking to resume).
- Flagged "Experimental" in the UI (game page and the reader's top zone). Twine has no `Engine`: the reader runs it
  directly (`TwineReader`, lazy chunk).

### 4.4 Saves

- Z-machine / Glulx: in-memory snapshots produced via the engine's autosave (after each turn), plus up to 5 named
  slots.
- Twine: the story format's own saves, in its storage kept by the reader (§4.3).
- Ink: `story.state.toJson()`, in a JSON envelope naming the story (a hash of its JSON); Undo restores the reader's
  previous turn snapshot. A turn begins at each choice.
- Undo: engine undo where available, else restore the previous autosave (keep last 10 turn snapshots in memory,
  last 1 on disk).
- Z-machine state: ZVM's own autosave snapshot (the RAM and stacks as a Quetzal file with uncompressed memory, plus the
  Glk library state, so a pending line input resumes), in a small JSON envelope naming the story; a plain Quetzal file
  can only be resumed by the game's own `@restore`. The game's SAVE / RESTORE commands are cancelled: saves go through
  the reader menu; the game reports the failure and goes on (a vendor patch keeps glkote-term from freezing on a
  cancelled restore, S1.24).
- Glulx state: Quixe's autosave snapshot (RAM, stack, heap and the Glk library state) in a JSON envelope naming the
  story (its first 64 bytes); the RAM is stored XORed with the story's initial RAM and deflated at once, so a state
  (Undo keeps 10 in memory) is a few KB even for a game with 1–2 MB of RAM.
- A turn begins when the game waits for a command: its state is snapshotted (after the page is drawn) for Undo and
  written as the autosave with the transcript tail (the last 200 paragraphs with text or a picture, at most ≈ 20,000
  characters; a picture is kept by its number, not its data, and resolved again by the engine after a reload),
  and the progress
  record is updated. Opening the game resumes from the autosave on the page of the last command. Restoring a slot
  resets Undo; Restart asks first, clears the autosave and keeps the named slots.
- A save is one storage entry: when the storage is full the write fails as a whole, the previous save stays intact and
  the Save dialog says so.

### 4.5 Performance

- Engines are loaded lazily per format (separate chunks).
- Long-running VM work is sliced so taps stay responsive: Quixe yields to the event loop once a run has taken 100 ms
  and carries on from a timer; meanwhile the command bar says "The story is thinking…". ZVM turns are fast enough to
  run in one go.
- Turn latency is measured on the device with the reader's `?perf=1` flag (`#/play/<tuid>?perf=1`): the status line
  shows the last turn's time in ms (and the console logs it). Targets: Z-machine turn < 1 s; Glulx turn < 3 s.
- Measured on the Kindle (S1.7, [device reports](docs/device-reports/README.md)): a large Inform 7 game (3.2 MB)
  takes 40 ms to ~3 s per turn depending on the location, a 1.3 MB one 280–300 ms. Both are within the target, and
  ~3 s now and then is acceptable.
- "May be slow" badge (`slow`, computed at index time): **no game is flagged** (the field and badge stay for a
  future rule, e.g. by story file size once the pipeline knows it; the IFDB API gives none).

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
   art (forgiveness is only in the iFiction XML, not fetched yet). **Languages** (S2.6): the language is the one of
   the file the app plays. For a game IFDB lists in several languages, each usable file's language is read from its
   IFDB description (a language named "only", `(English only.)`, `en français seulement`; or a single language
   named, `Spanish version`, `IFComp 2005 version (English)`, `Traducido por…`; not one translated *from*), else from
   a language tag in its file name (`hs_ita.z5`); a file of unknown language stands for the first language without a
   file. The best file of each language is kept: the chosen file is the default one when its language is known
   (otherwise the best file in IFDB's first language replaces it), the others become `versions`. Then a hand-kept
   override (`languages` in `content-policy.json`) sets the default file's language. `report.json` lists the games
   whose language is not IFDB's first, the games with a file per language, and counts the multi-language games
   whose file's language IFDB does not say (to review by hand). `check-cors.ts` also checks the files outside the
   IF Archive of games in several languages. Pick the best playable file among the formats
   enabled in `scripts/catalog/playability.json` (those with an engine): IF Archive URLs first, uncompressed before a
   zip (zips only when IFDB names the story file inside), `.zblorb/.gblorb` before bare story files; HTTPS only (IF
   Archive links upgraded). A file outside the IF Archive is used only if its host lets a browser page read it
   (CORS, checked by `check-cors.ts` before resolving, see [§5.5](#55-game-files)). Drop games without such a file,
   recording the reason in `report.json`.
   **Illustrated** (S2.5, `check-pictures.ts` before resolving): for an uncompressed Blorb in a format whose engine
   draws pictures (Glulx), read the resource index (`RIdx`, the first chunk) from the file's head — an HTTP `Range`
   request for 4 KB (asked once more when the index is longer), or the first bytes of the whole response when the
   host ignores `Range` — at ≤ 1 request/s with the project `User-Agent`, and flag the game when it holds at least two
   `Pict` resources besides the cover (the `Fspc` chunk; when that chunk is not in the head, one picture is assumed to
   be the cover). Results are cached per file URL with its size and `Last-Modified` in `cache/pictures.json` on the
   `catalog` branch, reused for 90 days, then revalidated (`If-Modified-Since`); `report.json` counts the Blorbs
   inspected and the illustrated games.
   **Ink web exports** (S2.7, `check-ink.ts` before checking CORS): a link of an ink game (development system `ink`,
   `Ink`, `Godot, Ink`…, not inklewriter or Binksi) is Ink when it is a compiled `.json`, a zip whose named file is a
   page or script, or a web page (an IFDB `hypertextgame` or `.html` link) outside itch.io. Each such zip or page is
   opened once (≤ 1 request/s): the file holding the story is the named file when it holds `storyContent` (or is the
   compiled JSON), else the first of the page's own scripts that does (the ink runtime skipped). The result is cached
   per link in `cache/ink.json` on the `catalog` branch for 90 days. The resolver then points the game's file at it
   (`archive.primary` for a zip, the script's URL for a page, whose CORS is the one checked) and drops exports
   without a story (`no-ink-story`). An HTML page of an ink game is never Twine. The job summary counts the ink games
   kept and dropped, by reason.
   **Story files that open** (S2.8, `check-stories.ts` after the CORS check): every Z-machine and Glulx file the
   resolver may pick is opened once as the app would (≤ 1 request/s): a zip whole (up to 64 MB), where the story is the
   file IFDB names, else the only file of that name in another case or folder, else the only story of the game's
   format; a bare file by its head only (an HTTP `Range` request, and the start of a Blorb's executable chunk when it
   lies further). It must hold a story of the game's format, and a Z-machine story must be version 3, 4, 5 or 8
   (ZVM's: version 6 games such as Zork Zero are left out). The result is cached per file in `cache/stories.json` on
   the `catalog` branch for 180 days (a network error is checked again at the next run, the file kept meanwhile). The
   resolver skips the files that do not open, takes the next best one, and drops a game left without any
   (`story-does-not-open`, with the reason and the file); a zip's story found under another name becomes
   `archive.primary`. The job summary lists the files that do not open with their games (to report to IFDB when the
   record is wrong) and the stories found under another name.
3. **Apply content policy** ([§5.4](#54-content-policy)).
4. **Emit** static JSON into `public/catalog/`:
   - `meta.json` — build date, counts (games, illustrated games), facet values (genres, languages, formats) with
     counts.
   - `index-<n>.json` — compact rows sharded by ~500 games (short keys to keep parse time low on Kindle):
     `{t: tuid, n: title, a: author, y: year, l: lang, lv: [other languages], g: [genres], f: format, r: avgRating, rc: ratingCount,
     s: starSort, p: playtimeMin, fg: forgiveness, c: hasCover, sl: slowFlag, st: starterFlag, il: illustrated}`, sorted by title;
     unknown values are left out (`fg` is not available from IFDB's JSON API yet; `st` marks the games carrying a
     newcomer-friendly IFDB tag of `scripts/catalog/starter-tags.json`).
   - `games/<tuid>.json` — full detail: blurb, credits, IFID, file URL(s), file size, licence, cover URL, IFDB link;
     `versions: [{language, file}]` for a game with a file per other language (S2.6);
     `illustrated: true` and `pictures` (pictures besides the cover) for an illustrated game.
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
  the curation is thin. A game with a file per language (S2.6) counts in each of its languages. The sample catalogue
  has its own, from `tests/fixtures/featured.json`.
- **Validation** — CI (`scripts/catalog/check-featured.sh`) checks the curated file against the catalogue published
  on the `catalog` branch and fails on: bad schema, missing or overlong pitch, unknown tuid (or not playable),
  excluded by hand or carrying an adult tag ([§5.4](#54-content-policy)), no language of the game a UI locale. At
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
  (the `primary` file the catalogue names; for Twine, also the files it uses, §4.3). The file must look like a story for its engine (Blorb or the format's
  header). For Ink (S2.7), the story is the compiled `.json`, or the object assigned to `storyContent` (`var`, `let`
  or `const`) in a web export's script or page, read as JSON (never run); a file without one is "Not a story file".
  Only the story's JSON is cached. Failures show an error page: Try again, Open on IFDB, Report a problem (a prefilled GitHub issue). Formats
  whose engine has not shipped yet say "Not playable yet" without downloading.
- Files are cached in localStorage only if small (< 512 KB after unzipping, deflated, keyed by file URL so a new
  version is re-downloaded; LRU, see §6); larger files are re-downloaded per session on Kindle. A Twine story kept
  with the files of its zip (§4.3) is cached with them, packed together, under the same limit for the whole. Caching a file only
  ever evicts other cached files, never saves.
- **Kept offline** (S5.3, §6.2): a game started is kept on the device (Cache API) instead, while kept adventures take
  less than 40 MB; "Keep offline" keeps one whatever its size. A kept story is read before the cache and the network;
  offline, a game that is not kept says "Needs Wi-Fi" (its file was dropped by the browser: "no longer on this
  device"), and Library shows "Offline: connect to browse the catalogue".

### 5.6 Attribution & terms

- Every game detail links back to its IFDB page; "Catalogue data from IFDB" in About.
- Cover art is hot-linked from IFDB, not re-hosted, and always requested **as a thumbnail** sized for the slot
  (`coverart?id=…&thumbnail=WxH`, IFDB caps it at 250×250), never at full size — full-size covers can weigh
  hundreds of KB over e-reader Wi-Fi.
- Respect IFDB and IF Archive usage etiquette; contact the IFTF before launch to announce the project (S7.2: the
  message, saying how the crawler, cover art and game downloads use their services, is drafted in
  `docs/launch/iftf-message.md`, with the launch steps and the announcements).
- **Licences** (S7.2): the app is MIT (`LICENSE`). The build writes `licences.txt` at the site's root, the full licence
  text of every third-party package and font the site serves (Vite's `build.license` list of bundled packages,
  completed by `scripts/build/licences.ts` with Quixe, the legacy bundle's core-js and SystemJS, and the probe's QR
  code script); Settings › About names the components and gives that file's address as text, with the source
  code's.

---

## 6. Local storage

### 6.1 Baseline: localStorage

All keys are prefixed and versioned:

| Key | Content |
|---|---|
| `ik:v1:prefs` | UI language, reader defaults (font, size, margins, spacing, align), list/grid choices |
| `ik:v1:home` | *My adventures*, most recently added first: `[{tuid, title, author, added, cover?}]` (title, author and whether IFDB has a cover, so Home needs no catalogue; turns and last played come from the progress record) |
| `ik:v1:progress:<tuid>` | `turns`, `lastPlayed`, `location`, per-game reader overrides (`reader`) |
| `ik:v1:save:<tuid>:auto` | latest autosave: `{v, date, turn, data, text}` (`data` = engine state, `text` = transcript tail, both deflated + base64) |
| `ik:v1:save:<tuid>:<slot>` | named save slots `1`–`5`, same record plus `name` |
| `ik:v1:save:<tuid>:twine` | a Twine story's own storage (§4.3): `{v, date, local, session}` (string maps), counted with the saves |
| `ik:v1:file:<tuid>` | cached story file (small files only) |
| `ik:v1:kept` | adventures kept offline (S5.3): `{<tuid>: {url, kind, title, author, size, date, where, files?, auto?}}` (`where`: `cache` or `local`; their files are in the Cache API, §6.2) |
| `ik:v1:kept:<tuid>` | a kept story in localStorage, on a browser without the Cache API (< 512 KB): `{v, story, game}`; pinned, never evicted |

A game played in another language than its default file's (S2.6) is stored as its own game under the id
`<tuid>-<lang>` (TUIDs have no `-`): its progress, saves, cached file and Home entry; `#/play/<tuid>-<lang>` plays it.
| `ik:v1:lru` | access order for evictable entries |

- Saves are compressed (deflate via a small pure-JS lib) then base64-encoded.
- **Quota management:** every write goes through the storage layer; on `QuotaExceededError`, evict cached
  story files (LRU) first, then old autosaves of games not played for 90 days; never evict named saves
  silently — warn the user instead.
- **Schema migrations:** a `ik:schema` key and ordered migration functions.
- **Reset all data** (Settings, two confirmations) removes every `ik:` key (any schema version and `ik:schema`) and
  the kept adventures' cache (`inkventure-kept`, S5.3), nothing else, then shows Home as on a first launch.
- **Storage unavailable** (disabled site data, private mode): the app runs on an in-memory store and shows a
  non-blocking warning that progress will not be kept.

### 6.2 Enhancements (class C devices)

- IndexedDB for story files and catalogue shards; Service Worker for offline app shell + recently played
  games. Feature-detected; never required. The Kindle measured in S0.3 exposes all three APIs, so this may reach
  class A too once it is shown to work there (§13 #11).
- **Offline mode (M7, S5.3):** the offline probe (S0.9, `/probe/offline/`) showed on the Kindle that a Service Worker
  serves a page with Wi-Fi off and that story files survive restarts in the Cache API and IndexedDB.
  - **App shell.** `sw.js` at the app's folder (its scope; registered once the page is up, production builds only)
    caches the page, the JS and CSS bundles (modern and legacy), the fonts and the small lazy chunks (French
    dictionary, saves, story files…) when it installs, in `inkventure-app-<version>`; the version changes with every
    build and the previous cache is deleted on activation. The precache list is generated from Vite's manifest
    (`scripts/build/service-worker.ts`). Each engine's chunks are cached only for the formats of kept adventures
    (listed in the kept cache's `kept/index.json`, read at install, and sent by the page when one is kept); files of
    the previous build are copied rather than downloaded again. The page and its files are served cache first, so
    the app opens with Wi-Fi off; online, a new build installs in the background and takes over at once, and the
    running page reloads at its next change of screen (it would otherwise ask for removed files). Everything else
    (catalogue, covers, game files, previews and other pages of the site) is left to the network.
  - **Kept adventures.** The story (with a Twine story's files) and the game's page data (`games/<tuid>.json`) are
    stored in the Cache API (`inkventure-kept`, kept by every build), pinned: nothing evicts them, only *Remove from
    device* (Settings › Kept on this device, game page, Home menu) or *Reset all data*. Without the Cache API, small
    stories (< 512 KB) go to localStorage (`ik:v1:kept:<tuid>`), which the LRU never evicts. IndexedDB is not used:
    every browser with a Service Worker has the Cache API. The list (`ik:v1:kept`) is in localStorage, so Home and
    the game page know at once what is kept. Sizes are counted by the app, since `estimate()` under-reports usage
    there. Covers are not kept: IFDB sends no CORS headers, and an opaque response is padded heavily in the quota
    (offline, kept games show their typographic cover).

### 6.3 Export / import (dropped from V1)

A text-code export / import (S5.2) was built and then dropped: a code holding a single Z-machine autosave is tens of
KB, so it can only travel by copy-paste or a file, which the Kindle's browser is unlikely to support, and the risk it
covers (the browser clearing its storage) is low (§13 #9). See [post-v1-ideas.md](docs/post-v1-ideas.md).

---

## 7. Internationalisation

- UI strings in `src/i18n/<locale>.json`, EN and FR at launch: `{name}` interpolation (numbers formatted for the
  locale) and plurals written as `{ "one": …, "other": … }` chosen by the `count` parameter (CLDR rules: EN one = 1,
  FR one = 0–1). Missing keys fall back to EN; a unit test enforces key, message-kind and placeholder parity.
- Locale chosen from the browser's preferred languages (`navigator.languages` / `language`), overridable in
  Settings ("Automatic" removes the override), persisted in prefs (`locale`); the choice is applied before the first render and sets `<html lang>`.
- Dates and numbers formatted with small helpers (no reliance on `Intl` on Kindle).
- The **game language** (Library filter, verb chips) is independent from the UI language.
- Featured pitches and ebook content are written per locale.

---

## 8. Ebook distribution

A free ebook, in EN and FR, is the main acquisition channel.

- **Content:** what interactive fiction is; how to play (typing commands, common verbs, compass, saving);
  how Inkventure works on your e-reader (Wi-Fi, experimental browser, where saves are kept); a chapter of
  **game cards** from `featured.json` (cover, pitch, length, difficulty, **"Play now" link** to
  `https://<host>/#/play/<tuid>` + QR code); credits (IFDB, IF Archive, authors).
- **Formats:** EPUB 3 source built from Markdown in `ebook/`; KF8/AZW3 produced for Kindle
  (via Calibre `ebook-convert` in CI); PDF optional.
- **Distribution:** direct download (site, IF community), possibly free on stores; links must open the
  device browser (Kindle opens external links in the experimental browser after a confirmation).
- The ebook build reads `featured.json` so cards stay in sync with the app.
- **Build** (`npm run ebook`, S6.1): per UI locale, the chapters `ebook/<locale>/NN-*.md` with the game cards
  inserted at a `<!-- cards -->` marker → EPUB 3 (Pandoc), which must pass EPUBCheck without warnings → AZW3
  (Calibre). The cards are the first 12 games (`ebook/config.json`) of the locale's `featured.json` list, curated
  first; a game without a curated pitch gets the first paragraph of its blurb, shortened. The cover is the IFDB
  thumbnail (§5.6), fetched at build time, or a text placeholder; the length and the "Start here" badge use the app's
  strings and rounding, and the badge stands in for difficulty (no forgiveness rating is emitted yet). The QR code
  is a PNG of the same link. The host is `ebook/config.json`'s `host`. The book cover is rendered from HTML with
  Playwright's Chromium (Calibre drops SVG covers). The Ebook workflow builds both books from the published catalogue
  on `v*` tags (artifact, and the EPUB and AZW3 files attached to the tag's GitHub release, §11.5) and on pull
  requests that touch the ebook. CI builds them in an image with the tools
  preinstalled (`.github/ebook-image`: Playwright's, plus Pandoc, EPUBCheck and Calibre; published to ghcr.io by
  the Ebook image workflow, tagged like Playwright).
- **Download page** (S6.3): `<host>/ebook/`, a standalone static page like `probe/` (not a route of the app), for
  readers on a computer. The Deploy workflow builds the books on every deployment of `main` (a job in parallel with
  the app's build, from the same catalogue) and publishes them at stable URLs, without a version:
  `ebook/inkventure-<locale>.epub` and `.azw3`, a cover thumbnail `ebook/inkventure-<locale>-cover.jpg`, and
  `ebook/books.json` (for each file: locale, format, size, build date, commit). If the ebook build fails, the site is
  deployed without them. The page follows the browser's language (EN/FR, `?lang=` switch), shows the book in that
  language first, a download button per format ("EPUB", for most e-readers; "AZW3", for e-readers that use that
  format) with size and build date, and how to copy the file to an e-reader (USB, the e-reader's own sending
  service, in generic terms). Without `books.json` (failed build, PR previews, `vite preview`) it says the books are
  not available. Its strings are the `ebookPage.*` keys of `src/i18n/`; `scripts/build/ebook-page.ts` writes
  `ebook/index.html` with them and compiles `src/ebook-page/page.ts` to ES5 (`ebook/page.js`) at build time: not a
  Vite entry, so the app's budgets do not count it. The ebooks have no size budget. Home's welcome and the ⋯ menu
  link to the page; Settings › About gives its address as text; the README and the ebook's credits chapter link to
  it.
- **Screenshots** (S6.2): the chapters show the app in grayscale PNGs (`ebook/<locale>/images/`, 16 gray levels,
  600 × 800 like a small e-reader), taken from the production build with the sample catalogue and the test fixtures
  by `npm run ebook:screenshots` and committed; the fixture stories are in English, so the French book's screenshots
  show the French UI with an English game (its buttons follow the game's language, which the text says).
- **First page of the book:** a large "Open Inkventure" link to the app at the top of the welcome chapter: the
  book's main use on the e-reader is to open the app with one tap.

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
| Hosting | GitHub Pages (project site, served from the `gh-pages` branch: `main` at the root, deployed by `.github/workflows/deploy.yml` after CI passes; each pull request under `pr-preview/pr-<n>/` by `preview.yml`). Public address `https://yciabaud.github.io/inkventure/`, no custom domain for V1 (S7.2); `ebook/config.json`'s `host` is the one place it is written for the build | Free, static; PRs can be tried on a device before merging. |
| CI/CD | GitHub Actions | Tests, build, catalogue job, ebook build. |

```
/
├── SPEC.md, CLAUDE.md, README.md, LICENSE
├── docs/BACKLOG.md, docs/stories/*.md, docs/launch/ (launch steps and messages)
├── src/
│   ├── app/            shell, hash router
│   ├── ui/             design-system components (TopBar, Button, Pager, Cover, Dialog…), icons
│   ├── screens/        home/, library/, game/, reader/, settings/
│   ├── reader/         paginator, command bar, chips
│   ├── engines/        engine.ts, glkote-bridge/, zvm/, quixe/, ink/, twine/
├── vendor/quixe/       Quixe 2.2.6 (MIT), downloaded at install (postinstall), patched at build time
│   ├── catalog/        index loader, filters, search
│   ├── storage/        storage layer, migrations
│   ├── i18n/           en.json, fr.json, i18n.ts
│   └── styles/
├── size-budget.json    asset size budgets (checked by scripts/size/)
├── public/catalog/     generated index (not hand-edited)
├── content/featured.json
├── scripts/catalog/    crawler, resolver, emitter, content-policy.json
├── scripts/size/       check-size.ts: asset budgets report (CI)
├── scripts/release/    build-notes.ts: release notes of a v* tag (Ebook workflow)
├── scripts/build/      Vite plugins: build-info.ts (version.json + build meta tag), licences.ts (licences.txt)
├── ebook/              ebook Markdown sources per locale, metadata, CSS, config (app address)
├── scripts/ebook/      build.ts: ebook build (cards, QR codes, cover, Pandoc, EPUBCheck, Calibre)
└── tests/
    ├── unit/           (or colocated *.test.ts)
    ├── e2e/            Playwright specs
    ├── production/     smoke test of the live site (real network, run by hand)
    └── fixtures/       tiny freely-licensed stories, recorded IFDB JSON
```

---

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Payload | Budgets in `size-budget.json`, enforced in CI by `npm run check:size` (S0.7): initial JS ≤ 150 KiB gz (legacy and modern), CSS ≤ 20 KiB gz, fonts ≤ 80 KiB as `.woff` (old e-readers' fallback) and ≤ 70 KiB as `.woff2`, each lazy chunk (engines, the French dictionary…) ≤ 100 KiB gz, each catalogue shard ≤ 150 KiB. **First load** ≤ 200 KiB for the baseline Kindle, counted as it loads (§2.2: modern JS + CSS + `.woff2`), and ≤ 250 KiB for old e-readers (legacy JS + CSS + `.woff`) (S0.10; raised from 200 with the owner's agreement on 2026-10-03, S1.22: they are best effort). Test fixtures are never inlined in the bundle; only the active UI language's dictionary is loaded (English in the bundle, French a lazy chunk). Cover images are requested as IFDB thumbnails (§5.6). |
| Speed (Kindle) | Home interactive < 3 s on Wi-Fi; page turn < 300 ms; Library first results < 4 s. |
| Compatibility | Legacy bundle passes `es-check es5`; no runtime errors in the capability-probe browsers. |
| Accessibility | Semantic HTML, labels on icon buttons, focus order, contrast ≥ 4.5:1, font scaling; dyslexia-friendly typeface option. |
| Privacy | No analytics, no third-party requests except IFDB cover art and game file hosts. No cookies. |
| Resilience | Clear error pages: game download failed (retry, open on IFDB), storage full (manage data), unsupported browser. |
| Licensing | App code open source (MIT, `LICENSE`); third-party components named in About, their full licence texts in `licences.txt` (§5.6). |

---

## 11. Testing strategy

Tests are part of every story's definition of done; CI blocks merges when they fail.

### 11.1 Unit tests — Vitest

- Catalogue: filter combinations, sorting, pagination, search normalisation (accents, case).
- i18n: lookup, interpolation, plurals, fallback, **no missing keys** between locales.
- Storage: schema, migrations, quota handling & LRU eviction (mocked quota).
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
  save/restore slots; undo; UI language switch; deep link cold start `#/play/<tuid>`;
  storage-full and download-failure error pages.
- Optional screenshot comparisons for key screens (stable, since there is no animation).
- **Production smoke** (S7.2, the one exception to "no network"): `tests/production/`, run by hand
  (`npm run test:production`, or the *Production smoke* workflow) against the live site, `ebook/config.json`'s `host`
  or `PROD_URL`: build and catalogue published, Home and Library, a featured Z-machine game downloaded from the IF
  Archive, the ebooks matching `books.json` and their links pointing to the site. Not part of `test:e2e`.
- **Rendering survey** (S7.3, also live network, by hand): `npm run survey:rendering` plays the featured parser games
  and the most-rated ones of the published catalogue headless, with the app's engines and GlkOte bridge (bundled by
  esbuild with the vendor patches), and writes `docs/reports/rendering-survey-<date>.md`: what each game uses that the
  reader drops or changes (tall upper windows, styles in them, several windows of a kind, graphics windows, timers,
  hyperlinks, characters outside the bundled fonts, wide fixed-width layouts), ranked by number of games.
- **Story-file scan** (S7.4, live network, by hand): `npm run survey:scan` reads the story file of every parser game of
  the published catalogue without playing it (a Z-machine disassembler and a Glulx reader in `scripts/survey/`) and
  writes `docs/reports/story-file-scan-<date>.md`: the games whose own code uses a display feature the reader drops or
  changes (quote boxes, drawing in the upper window, timed input, graphics or extra windows, hyperlinks, colours,
  sound, characters outside the fonts…), library code told apart by its frequency, and the games to replay with the
  rendering survey.

### 11.3 Legacy-compatibility gate

- `es-check es5` on the legacy build output (and the device probe), keeping very old e-readers running (best
  effort, §2.1); stylelint bans animations, transitions and other features useless or too new for e-ink. The baseline
  Kindle itself is covered by the modern-bundle e2e runs plus the device probe and checklist (§11.4).

### 11.4 Real-device checklist

- `docs/device-checklist.md` (story S7.1): a 15-minute manual script run on a real Kindle (and a Kobo)
  before each release; results recorded in `docs/device-reports/`, whose latest checklist the release notes copy
  (§11.5).
- **Timings** (Settings → About → Timings, or `?perf=1`): a small line at the top right of the screen gives the
  last time measured on the device — Home ready (from the page's start on a cold start, else from the address
  change), the Library's first results, a page turn in the reader (from the tap to the new page painted) — and the
  console logs each one. The reader's status line gives each game turn's time (§4.5).

### 11.5 Releases

- A release is a `v*` tag pushed with git. The Ebook workflow then builds the books and, in its `release` job,
  creates a **draft** GitHub release (title `Inkventure <tag>`) with the EPUB and AZW3 files attached and generated
  notes; the owner reads it and publishes it. A release created with its tag in GitHub's interface gets the books, and
  the notes only if its own are empty. A re-run replaces the attached files.
- The notes (`scripts/release/`, story S7.5), titled `Inkventure <tag> — <date of the tag>`, say: the catalogue (games by format, build date), the stories done since
  the previous tag (`docs/BACKLOG.md` at both tags; all of them for the first), the Results table of the latest
  `docs/device-reports/*-checklist.md`, the first-load sizes (`check:size --json`), the known issues (the open
  stories outside Post-V1) and the books with their sizes. An optional `docs/releases/<tag>.md` adds the highlights
  after the title and known issues first (its `### Known issues` section). `npm run release:notes` previews them.

---

## 12. Roadmap

| Milestone | Content | Stories |
|---|---|---|
| **M0 — Foundations & spikes** | Scaffold, CI, deploy, capability probe on Kindle, design system, i18n, storage, size budgets, PR previews | S0.1–S0.8 |
| **M1 — Playable Z-machine** | Paginated reader, settings, ZVM, command bar & chips, saves, status line | S1.1–S1.6 |
| **M2 — Catalogue pipeline** | IFDB crawl, playability, index, featured | S2.1–S2.4 |
| **M3 — Library & Home** | Library, game detail, file loader, Home shelves, settings | S3.1–S3.4, S4.1–S4.2, S5.1 |
| **M4 — More formats** | Glulx, illustrated games, Ink, Twine | S1.7–S1.9, S2.5 |
| **M5 — Ebook & launch** | Ebook build & content, device checklist, launch | S6.1–S6.2, S7.1–S7.2 |
| **M6 — Play fidelity** | Single-key prompts, Twine animations & colours, status rows, menus, answer chips, small rendering fixes | S1.12–S1.19, S1.21–S1.25, S2.8, S7.3, S7.4 |
| **M7 — Offline** | Offline probe on the Kindle, offline app shell and kept adventures | S0.9, S5.3 |

Details and dependencies: [docs/BACKLOG.md](docs/BACKLOG.md).

---

## 13. Open questions & risks

| # | Question / risk | Plan |
|---|---|---|
| 1 | Real capabilities of the Kindle browser. | **Measured** (S0.3, §2.2): modern engine, loads the modern bundle. localStorage persists across sleep / wake and a real device restart. Still open: swipe gestures in practice, older firmware / Kobo reports. Relax the ES5/CSS constraints only after more reports. |
| 2 | Does the IF Archive send CORS headers? | **Yes** (S0.3, main site and mirror): direct downloads; fallbacks in §5.5 kept. |
| 3 | IFDB API has no CORS. | **Confirmed live** on the Kindle (S0.3). Pre-built index (decided). |
| 4 | Glulx (Quixe) performance on Kindle CPUs. | Quixe ships time-sliced (S1.7); measure real games on the Kindle with `?perf=1`; "may be slow" badge (every Glulx game until measured); possibly exclude very large games. |
| 5 | Twine games vary wildly; restyling may fail. | Experimental flag; curated allowlist if needed. |
| 6 | IFDB adult tagging incomplete. | Tag denylist + manual exclude list; report link. |
| 7 | IFDB / IF Archive load and etiquette. | Weekly incremental crawl, rate limiting, contact IFTF. |
| 8 | Licences of mirrored story files (if fallback 2 is needed). | Mirror only files with explicit free licences; record licence in index. |
| 9 | Kindle may clear localStorage. | Survives sleep / wake and a device restart (S0.3), but could still be cleared by the user or the browser. Accepted for V1 (export/import dropped, §6.3). |
| 10 | Virtual keyboard covering the screen on Kindle. | Chips-first design; test layout with keyboard open on device. |
| 11 | Offline on Kindle: Service Worker, IndexedDB and Cache API exist there. | **Works** (S0.9, 2026-10-02): the page opens offline and kept files survive browser and device restarts. Offline app shell + kept adventures shipped in S5.3 (M7, §6.2), checked on the Kindle on 2026-10-03; whether the ebook's link opens the app offline is to check after the release. `persist()` is refused, so a lost file degrades to "Needs Wi-Fi" (offline) or is downloaded again (online). |
