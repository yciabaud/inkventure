# Device reports

Results of the device probe (story S0.3) on real e-readers. They replace the assumptions of SPEC §2.2 with facts.

## How to run the probe

1. On the e-reader, open **https://yciabaud.github.io/inkventure/probe/** in the browser
   (Kindle: *Menu → Experimental browser*; Kobo: *Beta features → Web browser*).
2. Wait until the status says **Done** (the storage quota and app-load checks can take ~30 s on a Kindle).
3. Tap and swipe left/right in the dashed **swipe box**, then tap **Run again** only if the status got stuck.
4. Send the report:
   - tap **Show QR code** and scan each part (*Part 1/3, 2/3…*) with a phone, or
   - copy the text from the *Copyable report* box.
5. Open the probe a second time after restarting the browser (or the device): the `storage.persistence` line then
   tells whether localStorage survived (`run #2`).

## Recording a report

Save the raw report as `docs/device-reports/<YYYY-MM-DD>-<device>.txt` (e.g. `2026-09-30-kindle-paperwhite-5.txt`),
add a line to the table below, and update SPEC §2.2 / §13 with what changed.

| Date | Device (model, firmware) | Browser | Report | Key findings |
|---|---|---|---|---|
| 2026-09-29 | Kindle, 636×848 CSS px @2x (model / firmware not recorded) | Experimental browser (UA says WebKit 531 / Kindle 3.0, engine is modern) | [2026-09-29-kindle.txt](2026-09-29-kindle.txt) | Modern engine (ES2017, no `?.`), loads the **modern** bundle; IF Archive CORS **ok**, IFDB API blocked; Home in ~1.1 s; localStorage ~4.75M chars; SW / IndexedDB / Cache API present; touch events fire although `ontouchstart` is absent; downloads **woff2**. |
| 2026-09-29 | Same Kindle, after sleep / wake (not a restart) | Experimental browser | [2026-09-29-kindle-after-sleep.txt](2026-09-29-kindle-after-sleep.txt) | localStorage kept across sleep / wake (`run #4`); a real restart is still to be tested. Other results unchanged; loop benchmark 454 ms vs 277 ms (expect ±60 % run-to-run variance on the CPU). |
| 2026-09-29 | Same Kindle, after a real device restart | Experimental browser | (only this line was sent) `storage.persistence: run #6, first run 2026-09-29T21:09:29.495Z` | **localStorage survives a device restart.** |

## Device checklist (story S7.1)

Before each release, run the [device checklist](../device-checklist.md) and save it filled as
`<YYYY-MM-DD>-<device>-checklist.md` here. Its timings come from *Settings → About → Timings*.

| Date | Device | Version | Home | Library | Page turn | Report |
|---|---|---|---|---|---|---|
| 2026-10-01 | Kindle (as 2026-09-29) | `18e798a` | 1 918 ms | 2 225 ms | 109–191 ms | [2026-10-01-kindle-checklist.md](2026-10-01-kindle-checklist.md) |

## Measuring turn latency (story S1.7)

1. On the e-reader, turn on **Settings → About → Timings: Shown** (editing the address is awkward in the Kindle
   browser), then open a game. Or add `?perf=1` after a game's address, e.g.
   `https://yciabaud.github.io/inkventure/#/play/<tuid>?perf=1` (or the pull request preview). The bundled Glulx
   fixture is `#/play/fixture-glulx`. Only games played by typing commands (Z-machine, Glulx) have turns to time; Ink
   and Twine show nothing.
2. Play about ten ordinary commands (`look`, `inventory`, moves, `examine …`). After each one the status line shows the
   turn's time, e.g. `(840 ms)`.
3. Note, per game: title and tuid, story file size (from its IFDB / IF Archive page), the first turn, and the typical
   and worst of the next turns. Save it as `docs/device-reports/<YYYY-MM-DD>-<device>-turns.txt` and add a line
   below.

| Date | Device | Game (tuid) | Format, file size | First turn | Typical | Worst | Report |
|---|---|---|---|---|---|---|---|
| 2026-10-01 | Kindle (as 2026-09-29) | Brain Guzzlers from Beyond! (`f55km4uutt2cqwwz`) | Glulx (Inform 7), 3.21 MB | – | – | ~3 s (40 ms – 3 s depending on the location) | [2026-10-01-kindle-turns.txt](2026-10-01-kindle-turns.txt) |
| 2026-10-01 | Kindle (as 2026-09-29) | Three-Card Trick (`afy6ej5cn9hof20m`) | Glulx, 1.3 MB | – | 280–300 ms | – | [2026-10-01-kindle-turns.txt](2026-10-01-kindle-turns.txt) |

## Reading the report

| Line | Meaning |
|---|---|
| `build.*` | Deployed commit and build date (from `version.json`). |
| `js.syntax.*`, `js.builtins.*` | Which ES2015+ syntax and built-ins exist natively (the app ships an ES5 bundle + polyfills anyway). |
| `storage.*` | localStorage availability, approximate quota (in characters) and persistence across runs. |
| `css.*` | Support for flexbox (modern / `-webkit-flex` / old `-webkit-box`), grid, custom properties, `filter`, etc. |
| `input.*` | Touch / pointer events and what the swipe box saw (tap vs. left/right swipe). |
| `perf.*` | Micro-benchmarks: 1e6-iteration loop, JSON parse/stringify of a ~150 KB catalogue-like payload, layout of 300 paragraphs. |
| `net.*` | Binary XHR, and whether the IF Archive (main site and mirror) and the IFDB API are readable cross-origin (CORS), plus whether IFDB cover thumbnails display. |
| `app.*` | The real app loaded in a hidden frame: time to first render of Home, legacy vs. modern bundle, bytes transferred, font format actually downloaded (`woff` / `woff2`). |
| `errors` | Uncaught script errors on the probe page. |
