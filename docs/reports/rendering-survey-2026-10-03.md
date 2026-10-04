# Rendering survey — 2026-10-03

Made by `npm run survey:rendering` (story S7.3): 60 parser games (60 played) of the published catalogue, featured first, then the most-rated, played headless with the app’s engines and GlkOte bridge. Script: intro (any key), then `look`, `inventory`, `help`, `about`, `verbose`, `x me`, each menu browsed with n return space q q q space return space q.

## Analysis and follow-ups

Read by hand from the results (2026-10-03). No game failed to load, stopped on an engine error or hung; none asked for a
timer, and none opened two windows of a kind.

1. **Quote boxes and title cards in the upper window — 7 games, the one that hurts.** Inform's `box` statement draws an
   epigraph centred in the upper window (Curses, Vespers, Jigsaw, An Act of Murder, Hunter in Darkness), and some games
   draw their title card or intro there (Filaments, Aisle). The game then waits for a key (or goes on with a line
   prompt, Vespers): the main window is not cleared, so S1.22 does not apply, and the top zone shows the first 3
   non-empty rows and "…". The quotation is cut; the rest is only in the ⋯ menu. **Story [S1.23](../stories/S1.23-upper-window-quote-boxes.md):** show such a
   box in the text area, after the turn's text, as a centred block, and leave the top zone to the status line.
2. **Menus drawn in the upper window — 13 games**, now shown in the text area (S1.22). All mark the selection with `>`
   (Savoir-Faire, Slouching Towards Bedlam and City of Secrets set a subtitle in bold, which the reader shows plain;
   minor). **City of Secrets** (Glulx) is the exception: a two-column menu with links, chosen by typing, with a
   graphics window; one game, no story proposed.
3. **Graphics windows — 2 games** (Counterfeit Monkey, City of Secrets): not shown; both play without them.
4. **Wide fixed-width layouts — 3 games**: start menus (Taco Fiction, Make It Good) and a verb table (Christminster's
   help) wrap on a 600 px screen but stay readable.
5. **Characters outside the bundled fonts — 1 game** (Alias 'The Magpie': `ł`, Latin Extended-A): drawn in a fallback
   font. Adding the latin-ext subset would cost font bytes for one game; no story proposed.

Limits: the script plays a few commands per game, so later scenes are not seen; the Z-machine's reverse video is read
from ZVM's `@set_style` (ZVM never sends it to GlkOte), and a reverse-video first row (the status line, a title bar)
is not counted.

## Findings by number of games

| Finding | Games | What it means | Games (first step) |
|---|---:|---|---|
| Tall upper window not shown in full | 8 | More than 4 rows in the upper window, outside the menus S1.22 shows in the text area: the top zone shows 3 rows and "…" (the others are in the ⋯ menu). | Filaments (intro), Aisle (intro), Vespers (x me), Curses (inventory), Hunter, in Darkness (intro), City of Secrets (help), An Act of Murder (intro), Jigsaw (intro) |
| Styles in the upper window | 4 | Rows of the upper window in different styles (a selection or a title in bold or reverse video): the reader shows them all alike. | Slouching Towards Bedlam (help), Savoir-Faire (help), Hunter, in Darkness (intro), City of Secrets (help) |
| Wide fixed-width text | 3 | Fixed-width lines laid out in columns (maps, tables, menus) longer than about 40 characters wrap on a 600 px screen. | Taco Fiction (intro), Make It Good (intro), Christminster (help: return) |
| Graphics window | 2 | Not shown: only pictures in the text are. | Counterfeit Monkey (intro), City of Secrets (intro) |
| Hyperlinks | 1 | Links shown as plain text; the reader does not declare hyperlink support. | City of Secrets (help) |
| Characters outside the bundled fonts | 1 | Drawn in a fallback font, or missing on an e-reader without one. | Alias 'The Magpie' (about) |
| Menu drawn in the upper window | 13 | Shown in the text area since S1.22 (informative: check it reads well). | Anchorhead (help), Lost Pig (help), Slouching Towards Bedlam (help), Vespers (about), Ad Verbum (help), Savoir-Faire (help), Curses (help), For a Change (help), Blue Chairs (help), The Edifice (help), Make It Good (help), Christminster (help), Jigsaw (help) |

## Games

| Game | Format | Turns | Findings |
|---|---|---:|---|
| 9:05 ★ | zcode | 6 | — |
| Anchorhead ★ | zcode | 17 | **Menu drawn in the upper window** (help): 7 rows |
| Bronze ★ | zcode | 6 | — |
| Filaments ★ | zcode | 9 | **Tall upper window not shown in full** (intro): 8 rows, key input |
| Lost Pig ★ | zcode | 14 | **Menu drawn in the upper window** (help): 8 rows |
| Ombre ★ | zcode | 6 | — |
| Photopia ★ | zcode | 6 | — |
| Spider and Web ★ | zcode | 6 | — |
| The Impossible Bottle ★ | zcode | 6 | — |
| Violet ★ | zcode | 7 | — |
| Shade | zcode | 6 | — |
| Galatea | zcode | 7 | — |
| Aisle | zcode | 13 | **Tall upper window not shown in full** (intro): 7 rows, key input |
| Counterfeit Monkey | glulx | 6 | **Graphics window** (intro): 1 graphics window(s) |
| Suveh Nux | zcode | 7 | — |
| Zork I | zcode | 6 | — |
| Slouching Towards Bedlam | zcode | 11 | **Menu drawn in the upper window** (help): 9 rows; **Styles in the upper window** (help): normal, subheader |
| The Dreamhold | zcode | 6 | — |
| Vespers | zcode | 12 | **Menu drawn in the upper window** (about): 10 rows; **Tall upper window not shown in full** (x me): 5 rows, line input |
| Shrapnel | zcode | 15 | — |
| The Wizard Sniffer | glulx | 8 | — |
| Superluminal Vagrant Twin | glulx | 6 | — |
| Ad Verbum | zcode | 14 | **Menu drawn in the upper window** (help): 9 rows |
| Savoir-Faire | zcode | 16 | **Menu drawn in the upper window** (help): 9 rows; **Styles in the upper window** (help): normal, subheader |
| Metamorphoses | zcode | 8 | — |
| Curses | zcode | 11 | **Tall upper window not shown in full** (inventory): 5 rows, line input; **Menu drawn in the upper window** (help): 11 rows |
| Alabaster | glulx | 6 | — |
| Hunter, in Darkness | zcode | 8 | **Tall upper window not shown in full** (intro): 6 rows, key input; **Styles in the upper window** (intro): reverse video on row 8 |
| Taco Fiction | glulx | 36 | **Wide fixed-width text** (intro): 55 characters: "Start the story - from the beginning    " |
| For a Change | zcode | 10 | **Menu drawn in the upper window** (help): 6 rows |
| Coloratura | glulx | 9 | — |
| Eat Me | glulx | 6 | — |
| Dual Transform | zcode | 6 | — |
| Pick Up The Phone Booth And Die | zcode | 6 | — |
| Fail-Safe | zcode | 7 | — |
| Blue Lacuna | glulx | 8 | — |
| Glass | zcode | 6 | — |
| City of Secrets | glulx | 8 | **Tall upper window not shown in full** (help): 5 rows, line input; **Graphics window** (intro): 1 graphics window(s); **Hyperlinks** (help): links in the upper window; **Styles in the upper window** (help): normal, subheader |
| Everybody Dies | glulx | 7 | — |
| Floatpoint | glulx | 8 | — |
| The Gostak | zcode | 6 | — |
| The Space Under the Window | zcode | 6 | — |
| A Day for Fresh Sushi | zcode | 6 | — |
| Lime Ergot | zcode | 6 | — |
| All Things Devours | zcode | 6 | — |
| The Lurking Horror | zcode | 6 | — |
| Blue Chairs | zcode | 14 | **Menu drawn in the upper window** (help): 9 rows |
| The Warbler's Nest | zcode | 28 | — |
| The King of Shreds and Patches | zcode | 28 | — |
| The Edifice | zcode | 16 | **Menu drawn in the upper window** (help): 9 rows |
| Make It Good | zcode | 18 | **Menu drawn in the upper window** (help): 10 rows; **Wide fixed-width text** (intro): 47 characters: "Start Game - in default mode    :   [SPA" |
| Christminster | zcode | 11 | **Menu drawn in the upper window** (help): 12 rows; **Wide fixed-width text** (help: return): 60 characters: "nouns            show current settings o" |
| An Act of Murder | zcode | 20 | **Tall upper window not shown in full** (intro): 6 rows, key input |
| Jigsaw | zcode | 12 | **Tall upper window not shown in full** (intro): 5 rows, key input; **Menu drawn in the upper window** (help): 8 rows |
| Earth and Sky | zcode | 6 | — |
| And Then You Come to a House Not Unlike the Previous One | glulx | 7 | — |
| Delightful Wallpaper | zcode | 6 | — |
| 69,105 Keys | zcode | 6 | — |
| Alias 'The Magpie' | glulx | 6 | **Characters outside the bundled fonts** (about): ł U+0142 |
| Color the Truth | glulx | 6 | — |

★ featured on Home.
