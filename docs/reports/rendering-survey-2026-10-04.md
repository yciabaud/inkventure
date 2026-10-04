# Rendering survey — 2026-10-04

Made by `npm run survey:rendering` (story S7.3): 32 parser games (32 played) of the published catalogue, featured first, then the most-rated, played headless with the app’s engines and GlkOte bridge. Script: intro (any key), then `look`, `inventory`, `help`, `about`, `verbose`, `x me`, each menu browsed with n return space q q q space return space q.

## Analysis

The games the [story-file scan of 2026-10-04](story-file-scan-2026-10-04.md) pointed to, replayed (S7.4). It confirms
at run time what the scan read in the files: graphics windows, timers and extra windows opened at the intro, links
asked for as input, tall upper windows. **SameGame stops on an engine error**: it offers to restore a game at its
start, and the cancelled file prompt crashes glkote-term's glkapi (the scan report's follow-up 3). The other games
played their script; real-time effects and the windows the reader drops are not visible in this headless run.

## Findings by number of games

| Finding | Games | What it means | Games (first step) |
|---|---:|---|---|
| Graphics window | 7 | Not shown: only pictures in the text are. | Best of Three (intro), City of Secrets (intro), Dead Cities (intro), Illuminismo Iniziato (intro), Los alegres hombres de Sherwood (intro), NewGrant (intro), Swigian (intro) |
| Styles in the upper window | 5 | Rows of the upper window in different styles (a selection or a title in bold or reverse video): the reader shows them all alike. | Andromeda Apocalypse — Extended Edition (intro), Bigger Than You Think (intro), City of Secrets (help), Illuminismo Iniziato (help), The Act of Misdirection (intro) |
| Hyperlinks | 5 | Links shown as plain text; the reader does not declare hyperlink support. | Bigger Than You Think (intro), City of Secrets (help), Dead Cities (intro), Never Gives Up Her Dead (intro), Swigian (intro) |
| Wide fixed-width text | 4 | Fixed-width lines laid out in columns (maps, tables, menus) longer than about 40 characters wrap on a 600 px screen. | Christminster (help: return), Dead Cities (intro), Make It Good (intro), The Act of Misdirection (intro) |
| Tall upper window not shown in full | 3 | More than 4 rows in the upper window, outside the menus S1.22 shows in the text area: the top zone shows 3 rows and "…" (the others are in the ⋯ menu). | Aisle (intro), City of Secrets (help), Vespers (x me) |
| Several windows of a kind | 3 | Grid windows share the one status zone; buffer windows (side panels) are mixed into the main text. | Best of Three (intro), Dead Cities (intro), NewGrant (intro) |
| Timer | 3 | The game asked for timer events, which the reader never sends (support: []). | Best of Three (intro), Los alegres hombres de Sherwood (intro), NewGrant (intro) |
| Engine error | 1 | The game stopped on an error. | SameGame (play) |
| Menu drawn in the upper window | 8 | Shown in the text area since S1.22 (informative: check it reads well). | Anchorhead (help), Christminster (help), Illuminismo Iniziato (help), Lost Pig (help), Make It Good (help), The Act of Misdirection (help), The Night of the Vampire Bunnies (about), Vespers (about) |

## Games

| Game | Format | Turns | Findings |
|---|---|---:|---|
| A Smörgåsbord of Pain | glulx | 9 | — |
| Aisle | zcode | 13 | **Tall upper window not shown in full** (intro): 7 rows, key input |
| Anchorhead | zcode | 17 | **Menu drawn in the upper window** (help): 7 rows |
| Andromeda Apocalypse — Extended Edition | glulx | 28 | **Styles in the upper window** (intro): emphasized, normal |
| Best of Three | glulx | 7 | **Graphics window** (intro): 1 graphics window(s); **Timer** (intro): 10 ms; **Several windows of a kind** (intro): 2 grid windows |
| Bigger Than You Think | glulx | 6 | **Hyperlinks** (intro): hyperlink input requested; **Styles in the upper window** (intro): normal, subheader |
| Christminster | zcode | 11 | **Menu drawn in the upper window** (help): 12 rows; **Wide fixed-width text** (help: return): 60 characters: "nouns            show current settings o" |
| City of Secrets | glulx | 8 | **Tall upper window not shown in full** (help): 5 rows, line input; **Graphics window** (intro): 1 graphics window(s); **Hyperlinks** (help): links in the upper window; **Styles in the upper window** (help): normal, subheader |
| Dead Cities | glulx | 15 | **Wide fixed-width text** (intro): 55 characters: "Start the story - from the beginning    "; **Several windows of a kind** (intro): 3 buffer windows; **Graphics window** (intro): 17 graphics window(s); **Hyperlinks** (intro): hyperlink input requested |
| Fail-Safe | zcode | 7 | — |
| Galatea | zcode | 7 | — |
| Illuminismo Iniziato | glulx | 17 | **Menu drawn in the upper window** (help): 11 rows; **Graphics window** (intro): 1 graphics window(s); **Styles in the upper window** (help): normal, user1 |
| Lock & Key | glulx | 6 | — |
| Los alegres hombres de Sherwood | glulx | 15 | **Graphics window** (intro): 1 graphics window(s); **Timer** (intro): 40 ms |
| Lost Pig | zcode | 14 | **Menu drawn in the upper window** (help): 8 rows |
| Make It Good | zcode | 18 | **Menu drawn in the upper window** (help): 10 rows; **Wide fixed-width text** (intro): 47 characters: "Start Game - in default mode    :   [SPA" |
| Never Gives Up Her Dead | glulx | 6 | **Hyperlinks** (intro): hyperlink input requested |
| NewGrant | glulx | 7 | **Graphics window** (intro): 1 graphics window(s); **Timer** (intro): 10 ms; **Several windows of a kind** (intro): 2 grid windows |
| Photopia | zcode | 6 | — |
| Rance the Dungeonkeeper | zcode | 7 | — |
| Rover's Day Out | glulx | 30 | — |
| SameGame | zcode | 0 | **Engine error** (play): TypeError: Cannot read properties of null (reading 'ref') |
| Shade | zcode | 6 | — |
| Shrapnel | zcode | 15 | — |
| Spider and Web | zcode | 6 | — |
| Swigian | glulx | 6 | **Graphics window** (intro): 1 graphics window(s); **Hyperlinks** (intro): hyperlink input requested |
| The Act of Misdirection | zcode | 15 | **Menu drawn in the upper window** (help): 9 rows; **Wide fixed-width text** (intro): 50 characters: "Start Game                      :   [SPA"; **Styles in the upper window** (intro): emphasized, normal |
| The Night of the Vampire Bunnies | zcode | 17 | **Menu drawn in the upper window** (about): 15 rows |
| Transparent | glulx | 8 | — |
| Unchanter | zcode | 6 | — |
| Vespers | zcode | 12 | **Menu drawn in the upper window** (about): 10 rows; **Tall upper window not shown in full** (x me): 5 rows, line input |
| Z-snake | zcode | 8 | — |

★ featured on Home.
