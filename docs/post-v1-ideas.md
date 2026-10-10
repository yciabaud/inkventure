# Post-V1 ideas: more engines, illustrated games, more catalogues

Brainstorm notes, **not** stories. Nothing here is scheduled; each idea needs a spike or a spec change before it
becomes a story in [BACKLOG.md](BACKLOG.md). Research done on 2026-09-30 from the source repositories (cloned and
read) and the web. itch.io, CASA, ifwiki and a few other sites were blocked by the research proxy, so claims about
them come from search snippets and are marked *(unverified)*.

## The constraint that decides everything

The baseline Kindle (SPEC §2.2, probe reports in [device-reports/](device-reports/README.md)) has a modern JS engine
(ES2015–2017, no `?.`) but **no WebAssembly**, and a CPU ~50–80× slower than a desktop (1e6-iteration loop:
277–454 ms). Touch events fire even though `'ontouchstart' in window` is false. Consequences:

- An engine must be **plain JavaScript**. Emscripten/WASM builds are out; asm.js / `wasm2js` output is possible in
  principle but large and slow.
- Anything that redraws a canvas at 60 Hz must be patched to **redraw only on change** (e-ink repaint is
  100–500 ms and ghosts).
- Each lazy engine chunk must fit the 100 KiB gz budget (`size-budget.json`).
- GPL engines cannot simply be bundled into an MIT app; each one needs a licensing decision.

## Summary

| Idea | Pure JS? | Kindle fit | Content & catalogue | Verdict |
|---|---|---|---|---|
| **Decker** decks | Yes (MIT) | Good UI fit (1-bit, cards, click); runtime needs patching | IFDB lists some; ~300 on itch.io | **Most promising** — spike |
| **Bitsy** games | Yes, ES5 (MIT) | Good: spike done, ~10–225 ms per tap on the Kindle, engine unchanged | ~6–12k on itch.io, almost none on IFDB | **Go** (S0.12), catalogue needs permissions |
| **DAAD** games (incl. Adventuron 8-bit exports) | Yes, jDAAD (GPL-3) | Text + pictures, parser | Small, scattered | Worth a look if GPL is acceptable |
| Magnetic Scrolls | Yes, Magnetic Scripts (licence unknown) | Text + pictures | Games **not redistributable** | No |
| TADS, Hugo, ADRIFT, Alan, AGT, Level 9, Scott Adams (graphics), Quill/PAW, GAC | No maintained pure-JS interpreter | — | IF Archive | Only via our own asm.js builds — expensive |
| Frotz | No JS build found | — | — | No: ZVM already covers it |
| ScummVM | WASM only | No | — | No |
| Adventuron web games | Closed engine, HTML/canvas only | Unknown | ~100 on itch.io, some on IFDB | No (except via DAAD export) |

## Decker

HyperCard-like tool by John Earnest: cards, buttons, fields, 1-bit patterns, scripts in the Lil language.

- **Licence:** MIT. <https://github.com/JohnEarnest/Decker> (v1.71, 2026-09-27).
- **Web runtime is pure JS**, no WASM: `js/lil.js` (Lil interpreter, 191 KB), `js/decker.js` (230 KB), about
  **127 KB gz** for the runtime alone. That is over our 100 KiB lazy-chunk budget: needs trimming (the editor is
  included) or a budget discussion.
- **Syntax:** ES2015 except one `**` (ES2016) and two trailing commas in calls (ES2017); no `?.`, `??`, classes or
  async. Very likely fine on the baseline, to confirm on the device.
- **Format:** fully documented line-based text ([docs/format.md](https://github.com/JohnEarnest/Decker/blob/main/docs/format.md)),
  written "to facilitate the creation of compatible document viewers". A published `.html` deck embeds the deck in a
  `<script language="decker">` block, so the deck can be extracted and run by another runtime.
- **Display:** default card 512×342 (configurable per deck), 1-bit with 28 patterns plus an optional 16-colour
  palette. At the Kindle's 636×740 viewport it shows at 1:1. Ideal for e-ink in principle.
- **Kindle blockers:**
  - `sync()` recomputes all 175k pixels on **every** `requestAnimationFrame`, with no dirty check. Our estimate is
    100 ms to several hundred ms per frame on the Kindle, and a pegged CPU even on a static card.
  - Transitions (`go[... z]`), `sleep`, `sys.frame` and animated patterns (15 Hz) assume 60 fps.
  - It uses mouse and touch events, not Pointer Events. Touch events do fire on the Kindle.
  - To check on the device: `new ImageData(w,h)`, `{passive:false}` listeners, `webkitAudioContext`.
- **Needed:** a patched runtime that redraws on change, skips transitions and freezes animated patterns. Budget: the
  Lil interpreter alone might fit a chunk.
- **Content:** itch.io tag `decker`, ~300 games, 288 HTML5 *(unverified count)*. Jams in July and December. IFDB
  lists notable Decker games (IFDB Awards have a Decker category) as web games (`hypertextgame`, development
  system "Decker").
- **Spike:** load one real deck with a patched web-decker on the Kindle; measure one card change and one button
  script.
- **Spike done** ([S0.11](stories/S0.11-decker-spike.md), Kindle
  [report](device-reports/2026-10-10-kindle-decker.txt) of 2026-10-10): the patched runtime plays the tour deck. It
  starts in ~8.5 s (runtime 3.8 s, first card 4.6 s later); a card change shows **1.1–1.4 s** after the tap (a tick
  ~450 ms + a draw ~550 ms); a still card uses no CPU (0 ticks, 0 draws in 10 s); the device keyboard never opens on
  the canvas. Patched runtime: 107 KiB gz minified, over the 100 KiB lazy-chunk budget with the editor still in it.
- **Recommendation: go, with conditions.** Card-and-button decks (the HyperCard-like ones: stories, puzzles, point and
  click) are playable at about a second per tap, close to a Glulx turn on the same Kindle; decks that draw, drag or
  animate are not. A Decker engine story would:
  1. **cut the draw** (~550 ms): convert and put only the rows of the frame buffer that changed (the patched `sync`
     already compares them), and measure what a tick (~450 ms) spends;
  2. **remove the editor** from the runtime, to fit the lazy-chunk budget (owner's decision);
  3. **type with the Kindle keyboard** through a hidden input over the tapped field, `keycaps` off (owner's decision);
  4. aim for **< 1 s from a tap to the new card and < 5 s to open** on the Kindle, and stop (no-go) if it cannot get
     close;
  5. feed a **curated shelf** of card-and-button decks only, each tested on the Kindle, with its author's permission
     or a free licence (strategy below).

## Bitsy

Tiny tile-based game maker by Adam Le Doux: walk an avatar around 16×16-tile rooms, bump into sprites to get
dialogue.

- **Licence:** MIT since v6.4. The repo moved to <https://codeberg.org/adamledoux/bitsy> in July 2026; the GitHub
  repo `le-doux/bitsy` is a read-only archive (v8.14).
- **Engine:** pure JS, **ES5 syntax**, about 245 KB raw / **57 KB gz**. Rendering uses a 2D canvas (128×128 scaled
  ×4).
- **Format:** plain text (`PAL`, `ROOM`, `TIL`/`SPR`/`ITM`, `DLG`, `VAR`, `TUNE`, `BLIP` blocks) embedded in the
  export as `<script type="text/bitsyGameData">`. No formal spec; the parser (`world.js`) and the dialogue script
  interpreter (`script.js`, 70 KB) are the reference.
- **Display:** 8×8 tiles, palettes of three colours by default (more allowed since v8), 2-frame animations every
  400 ms, text effects (`{wvy}`, `{shk}`, `{rbw}`), transitions, character-by-character text.
- **Kindle blockers:**
  - `soundchip.js` does `new AudioContext()` at top level with no guard, which throws without Web Audio.
  - The main loop is `setInterval(update, 16)`, i.e. 60 Hz.
  - Input handles keys and touch only: swipes to move, tap to advance dialogue, no on-screen pad.
  - Every exported game bundles its own engine version, so older games carry older engines.
- **Needed:** our **own player** reading the text data. It would render on change, use an on-screen direction pad
  (48 px targets), map palettes to grays and drop text effects. This ignores the bundled engine and avoids version
  drift, but the dialogue script language must be reimplemented or the MIT `script.js` reused.
- **Forks and hacks:** bitsy-hacks (JS injected into exports) and forks such as Bitsy HD (16×16 tiles),
  Bitsy Color and Bitsy 3D. Games using them would not play correctly from the data alone; how many there are is
  *unverified*.
- **Content:** ~12k "made with bitsy" and ~6k tagged on itch.io *(unverified counts)*, almost nothing on IFDB.
  Precedent: Ragzouken's [bitsy-archive](https://github.com/Ragzouken/bitsy-archive) (~450 games, collected **with
  each author's permission**).
- **Spike:** a player for one bundled sample game (with its author's permission) rendering rooms and dialogue in the
  reader, measured on the Kindle.
- **Spike done** ([S0.12](stories/S0.12-bitsy-spike.md), Kindle
  [report](device-reports/2026-10-10-kindle-bitsy.txt) of 2026-10-10). Rather than our own player, the probe keeps
  Bitsy 8.14's engine unchanged and replaces only its system layer (input with an on-screen pad, no sound, a loop
  that ticks only while something happens). On the Kindle: first room **164 ms** after the start (under a second from
  opening the page), each step or dialogue page drawn **10–225 ms** after the tap (ticks ≤ 31 ms, draws ≤ 25 ms),
  0 ticks and 0 draws on a still room. The runtime is 29 KiB gz minified, all ES5. The room is sharp at 512 px. Seen
  on the screen: text effects drawn still look like a glitch, and partial-refresh ghosting leaves traces of the
  avatar's steps and of a closed dialogue box. Of bitsy-archive's 451 games, 449 start and take input with the pinned
  engine, 407 without HD tiles or hack tags; 91 % animate (they would stand still).
- **Recommendation: go.** Bitsy is the cheapest graphical format so far: about ten times faster per tap than Decker on
  the same Kindle, with no engine patch. A Bitsy engine story would:
  1. wrap the probe's e-ink layer (`scripts/build/bitsy-eink/`) in the reader as a lazy engine chunk, with the
     reader's own controls (pad, Refresh screen, saves if Bitsy's state can be kept);
  2. draw effect text flat (drop `{wvy}`, `{shk}`, `{rbw}`) and deal with ghosting: a full black/white refresh on a
     room change, and room backgrounds pushed towards white or black;
  3. feed a **curated shelf** of games with each author's permission (bitsy-archive's authors list is a start),
     each tested on the Kindle.

## Illustrated retro adventures

| System | Pure-JS interpreter | Licence | Notes |
|---|---|---|---|
| DAAD | [jDAAD](https://github.com/Utodev/jDAAD) (very active, 2026-09) | GPL-3 | Canvas + PNG pictures; bundles jQuery. Adventuron can export to DAAD (experimental), so Adventuron games could become playable this way. |
| Magnetic Scrolls | Magnetic Scripts, the [MS Memorial](https://msmemorial.if-legends.org/) web player (2015) | *unknown*, no public repo | Games are **not redistributable** (rights holders' written permission required). |
| Scott Adams | None usable: Tensodoct is Node-only; a 2026 "browser edition" has no licence and uses AI pictures | — | Original pictures only in native ScottFree forks (Spatterlight, Gargoyle, ScummVM). |
| Level 9 | em-snowball: an asm.js test port, archived 2016, Firefox-only | none | Shows asm.js is feasible; not usable as is. |
| Quill / PAW (original) | None (UnQuill is native C) | — | ngPAWS authors new HTML games; it does not run original snapshots. |
| GAC | None (reGAC is Python) | — | — |

## Other text IF formats (TADS, Hugo, ADRIFT, Alan, AGT)

- **No maintained pure-JS interpreter exists.** TadsJS is an abandoned stub. The TADS 2 HTML5 port is an Emscripten
  proof of concept that needs `SharedArrayBuffer`. HugoJS is Emscripten + WASM. The ADRIFT WebRunner is
  server-side, and FrankenDrift is .NET. Alan and AGT have no web build.
- [Emglken](https://github.com/curiousdannii/emglken) (Bocfel, Git, Glulxe, Hugo, Scare, TADS) is **WASM only**:
  it needs Rust RemGlk-rs and Asyncify, with no asm.js path.
- The only route is our own Emscripten builds with `-sWASM=0` and Asyncify: large, slow and mostly GPL. That is a
  per-format project, to consider only if one format has a lot of wanted games.

## Frotz and ScummVM (no)

- **Frotz:** no official JS, asm.js or WASM build found (Frotzer is a Node wrapper around native dfrotz). ZVM
  already plays Z3/4/5/8. Bocfel (in Emglken, with V6 support) is WASM.
- **ScummVM:** it has an in-tree Emscripten target (demo and freeware games), which is WASM only. Its Glk engine is
  interesting as a reference: it contains a Frotz-derived Z-machine with V6 support, and also ADRIFT, AGT, Alan,
  Hugo, Level 9, Magnetic, Scott Adams and TADS. But it is GPL-3 C++.

## jsscummvm (no)

Looked at on 2026-10-10 (repository cloned and read): [jsscummvm](https://github.com/mutle/jsscummvm), a native
JavaScript port of ScummVM's SCUMM engine by Mutwin Kraus.

- **Abandoned and partial:** 23 commits from May to August 2010, nothing since. ~5,100 lines; it targets only
  *Monkey Island 1* (CD version, SCUMM v5) and its last commits reach the second room. No sound, no saves, no other
  SCUMM version. Carrying it on means porting most of ScummVM's SCUMM engine (v1–v7) ourselves.
- **No games to offer:** SCUMM games are commercial (Disney / Lucasfilm) and cannot be redistributed; ScummVM's
  freeware games (Beneath a Steel Sky, Flight of the Amazon Queen, Drascula…) use other engines. The app is static
  with a CI-built catalogue, and user-supplied files were rejected (2026-09-30), so nothing would be playable.
- **Licence unclear:** the repository says MIT, but its README says the code is "directly ported from ScummVM's C++
  code base" (GPL-2+), so it would have to be treated as GPL.
- **Worst e-ink fit:** 256-colour point-and-click with scrolling rooms and animated actors, on a timer at the game's
  frame rate; Decker's still 1-bit cards already cost ~1.2 s a tap on the Kindle.

Verdict: **no**. Bitsy and DAAD (spikes S0.12, S0.13) are the graphical formats worth the effort.

## Risk found on the way: ZVM maintenance

[Parchment](https://github.com/curiousdannii/parchment) has **dropped ZVM and Quixe from its active engines**
(commented out in `src/common/formats.ts`). It now runs only Emglken WASM builds. ifvms.js (ZVM) was last committed
2025-07-12. Both of our V1 parser engines (ZVM, and Quixe for S1.7) are therefore effectively frozen upstream: bugs
are ours to fix. ZVM also has **no V6 support**, so the graphical Infocom games (Zork Zero, Arthur, Journey, Shogun)
stay out.

## Catalogues

- **IFDB:** the "development system" field is free text, and web games use the generic `hypertextgame` format.
  Adventuron and Decker games are listed; Bitsy barely is. This is the only structured source for these systems,
  and our crawler already sees `hypertextgame`.
- **itch.io:**
  - **No public API** to list or search other people's games. The server-side API only covers your own account.
  - Available without auth: per-game `https://{author}.itch.io/{game}/data.json` (metadata only, no licence field)
    and RSS feeds on browse pages (append `.xml`, e.g. `https://itch.io/games/tag-decker.xml`).
  - HTML games are served from `*.itch.zone` behind a sitelock and anti-hotlinking, so they cannot be fetched by our
    app.
  - Redistribution needs each author's permission; the optional licence metadata is per game.
  - Approximate tag counts *(unverified)*: `adventuron` 106, `bitsy` ~5.7–6.4k, `decker` 300, `twine` ~8.9k,
    `interactive-fiction` ~43k.
- **IF Archive:** `indexes/Master-Index.xml` (~13 MB) lists every file with description and IFDB tuid, so it is
  usable by CI. It has Scott Adams games (copyrighted but freely downloadable), Level 9 interpreters, and Quill/PAW
  tools and Spectrum snapshots. Magnetic Scrolls has hints and tools only.
- **CASA** (solutionarchive.com): metadata, maps and solutions for 9,000+ games; no downloads, no API.
- **French community:** fiction-interactive.fr relies on IFDB rather than its own database. The yearly francophone
  contest now runs on itch.io (18th edition in 2025); its recommended systems are Inform 6/7, Twine, Undum and ink.

## Catalogue strategy for itch.io content (Decker, Bitsy…)

Separate **metadata** (title, author, cover, tags) from **game files**. Metadata can be collected, but files are
the hard part.

### Option A — Scrape itch.io

- **Metadata is feasible.**
  - Browse-page RSS feeds (`https://itch.io/games/tag-decker.xml`) give the list of games.
  - `https://{author}.itch.io/{game}/data.json` gives title, authors, tags and cover. itch.io's founder recommends
    it over scraping HTML.
  - A weekly CI job like the IFDB crawler (S2.1–S2.3) would work: cache, rate limit, honest User-Agent, recorded
    fixtures for tests.
- **Game files are the blocker.**
  - HTML games are served from `*.itch.zone` behind a sitelock and anti-hotlinking, so the app cannot load them
    from the Kindle.
  - Mirroring them in CI and re-hosting them on GitHub Pages means redistributing copyrighted works without
    permission. The engine's MIT licence does not cover the game, and itch.io's terms only cover use on itch.io.
- **Metadata only, with a "Play on itch.io" link, is possible but poor.** The Kindle would open the full itch.io
  page with the stock engine running at 60 Hz, which is barely playable.

### Option B — Curated catalogue, entered by hand

Built on the `featured.json` pattern (S2.4): a hand-maintained file, validated in CI.

- An **"Illustrated games" shelf** of 20–50 Decker/Bitsy games chosen because they work well on e-ink: 1-bit or few
  colours, little animation, no hacks.
- Each entry has the **author's permission** or an explicit free licence, plus credits and the source URL.
- The `.deck` or `.bitsy` file is stored in the repo and served by GitHub Pages. These are small text files, tens to
  hundreds of KB.
- Every game is tested on the Kindle before it is added.
- The cost is human, mostly writing to authors. There is a precedent: Ragzouken's bitsy-archive collected ~450
  games with permission.

### Rejected — User-supplied games

An "Open a file or URL" entry point (the player brings a `.deck`, `.bitsy` or `.html` file) was considered and
**rejected by the product owner** (2026-09-30).

### Recommendation: hybrid

1. **A CI metadata scraper that produces a candidate list for us, not for the app.** For each game it records tags,
   declared licence, engine and whether it is HTML5. It is rate limited and stores no game files.
2. **Human curation** from that list, with permission requests, into a curated file (Option B).

Open questions:

- Do itch.io's terms allow automated reads of RSS and `data.json` at a weekly cadence? This needs checking in a
  browser; the research proxy blocked the terms page.
- Where to keep permission records, e.g. a `permissions` field with the date and a link to the author's reply.

## Moving saves between devices

The V1 text-code export / import (S5.2) was built and dropped (closed PR #41): codes of tens of KB only travel by
copy-paste or a file, which e-reader browsers rarely support. If players ask for it, better shapes would be a small
sync service (against the "static only" rule, so a real decision) or a phone-to-reader hand-off via a short code or QR
code. The PR #41 codec (`src/storage/transfer.ts`: CRC-checked deflate + base64, merge / overwrite rules, all-or-nothing
import) can be reused.

## Promoted to V1

- **Illustrated Glulx games** (static, detailed pictures that suit e-ink, with an engine and catalogue V1 already
  has): detection, badge and Library filter in [S2.5](stories/S2.5-illustrated-games.md).

## Written as stories

Milestone V1.1 in the [backlog](BACKLOG.md):

- **Tappable compass** in the status window (Bronze's exits): [S1.20](stories/S1.20-tappable-compass.md).
- **Decker spike** on the Kindle (next step 1 below): [S0.11](stories/S0.11-decker-spike.md).
- **Bitsy spike** on the Kindle, with a count of the games that play from their data: [S0.12](stories/S0.12-bitsy-spike.md).
- **DAAD spike** on the Kindle (jDAAD), with a catalogue count and the GPL question: [S0.13](stories/S0.13-daad-spike.md).

## Possible next steps

1. **Decker spike** on the Kindle: done (S0.11), recommendation above: go, with conditions; a Decker engine story is
   the owner's call.
2. **Bitsy and DAAD spikes** on the Kindle: S0.12 done (go, above); S0.13 to do.
3. **Catalogue**, following the hybrid strategy above: a candidate scraper, then a curated, permission-based shelf
   (no user-supplied files).
4. Record the ZVM/Quixe maintenance risk in SPEC §13.
