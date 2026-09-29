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
