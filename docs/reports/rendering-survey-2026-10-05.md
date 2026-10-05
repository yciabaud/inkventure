# Rendering survey — 2026-10-05

Made by `npm run survey:rendering` (story S7.3): 47 parser games (47 played) of the published catalogue, featured first, then the most-rated, played headless with the app’s engines and GlkOte bridge. Script: intro (any key), then `look`, `inventory`, `help`, `about`, `verbose`, `x me`, each menu browsed with n return space q q q space return space q.

## Findings by number of games

| Finding | Games | What it means | Games (first step) |
|---|---:|---|---|
| Styles in the upper window | 4 | Rows of the upper window in different styles (a selection or a title in bold or reverse video): the reader shows them all alike. | City of Secrets (help), Hunter, in Darkness (intro), Slouching Towards Bedlam (help), The Act of Misdirection (intro) |
| Wide fixed-width text | 4 | Fixed-width lines laid out in columns (maps, tables, menus) longer than about 40 characters wrap on a 600 px screen. | Christminster (help: return), Gourmet (intro), Make It Good (intro), The Act of Misdirection (intro) |
| Graphics window | 3 | Not shown: only pictures in the text are. | City of Secrets (intro), Counterfeit Monkey (intro), Los alegres hombres de Sherwood (intro) |
| Tall upper window not shown in full | 1 | More than 4 rows in the upper window, outside the menus S1.22 shows in the text area: the top zone shows 3 rows and "…" (the others are in the ⋯ menu). | City of Secrets (help) |
| Boxes on many turns | 1 | The text kept a box of the upper window 3 times or more: maybe a status window read as a box (S1.23), check. | Tapestry (end) |
| Timer | 1 | The game asked for timer events, which the reader never sends (support: []). | Los alegres hombres de Sherwood (intro) |
| Hyperlinks | 1 | Links shown as plain text; the reader does not declare hyperlink support. | City of Secrets (help) |
| Box drawn in the upper window | 23 | A box under the status line (a quotation, a title card): shown in the text area since S1.23 (informative: check it reads well). | A Bear's Night Out (intro), A Smörgåsbord of Pain (intro), Aisle (intro), An Act of Murder (intro), Anchorhead (intro), Augmented Fourth (intro), Conan Kill Everything (intro), Curses (intro), Fail-Safe (intro), Fate (intro), Filaments (intro), Gourmet (intro), Hunter, in Darkness (intro), Jigsaw (intro), Little Blue Men (intro), Make It Good (intro), Metamorphoses (intro), Shrapnel (intro), Tapestry (intro), The Act of Misdirection (intro), The Meteor, the Stone and a Long Glass of Sherbet (intro), The People's Glorious Revolutionary Text Adventure Game (intro), Vespers (intro) |
| Menu drawn in the upper window | 17 | Shown in the text area since S1.22 (informative: check it reads well). | A Bear's Night Out (help), Ad Verbum (help), Anchorhead (help), Augmented Fourth (help), Being Andrew Plotkin (about), Christminster (help), Curses (help), For a Change (help), Jigsaw (help), Little Blue Men (help), Lost Pig (help), Make It Good (help), Slouching Towards Bedlam (help), The Act of Misdirection (help), The Edifice (help), The Meteor, the Stone and a Long Glass of Sherbet (help), Vespers (about) |

## Games

| Game | Format | Turns | Findings |
|---|---|---:|---|
| A Bear's Night Out | zcode | 15 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "The children tucked Teddy into his\\nspecial bed, climbed into their own,\\nand s; **Menu drawn in the upper window** (help): 9 rows |
| A Change in the Weather | zcode | 7 | — |
| A Day for Fresh Sushi | zcode | 6 | — |
| A Smörgåsbord of Pain | glulx | 9 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "PART 1 / Lunch Break" |
| Ad Verbum | zcode | 14 | **Menu drawn in the upper window** (help): 9 rows |
| Aisle | zcode | 13 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "- A I S L E - / by Sam Barlow / You are about to read a story. Or rather, part  |
| All Things Devours | zcode | 6 | — |
| An Act of Murder | zcode | 20 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "MACBETH: / Still it cried 'Sleep no more!' to all the house:\\n'Glamis hath murd |
| Anchorhead | zcode | 17 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "The oldest and strongest emotion of mankind\\nis fear, and the oldest and strong; **Menu drawn in the upper window** (help): 7 rows |
| Augmented Fourth | zcode | 15 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "\\"Actually, I find hamsters to be quite\\ndisagreeable little beasts. Always run; **Menu drawn in the upper window** (help): 7 rows |
| Being Andrew Plotkin | zcode | 10 | **Menu drawn in the upper window** (about): 9 rows |
| Bronze | zcode | 6 | — |
| Christminster | zcode | 11 | **Menu drawn in the upper window** (help): 12 rows; **Wide fixed-width text** (help: return): 60 characters: "nouns            show current settings o" |
| City of Secrets | glulx | 8 | **Tall upper window not shown in full** (help): 5 rows, line input; **Graphics window** (intro): 1 graphics window(s); **Hyperlinks** (help): links in the upper window; **Styles in the upper window** (help): normal, subheader |
| Conan Kill Everything | zcode | 6 | **Box drawn in the upper window** (intro): under 1 status rows, line input: "Violence is not an answer -\\nas long as you're just talking about it / (Stefan  |
| Counterfeit Monkey | glulx | 6 | **Graphics window** (intro): 1 graphics window(s) |
| Curses | zcode | 11 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "Let Rome in Tiber melt, and the wide arch\\nOf the ranged empire fall! Here is m; **Menu drawn in the upper window** (help): 11 rows |
| Deadline Enchanter | zcode | 15 | — |
| Earth and Sky | zcode | 6 | — |
| Fail-Safe | zcode | 7 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "FAIL-SAFE / --   By Jon Ingold (c) 2000\\n<ji207@cam.ac.uk>" |
| Fate | zcode | 29 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "Men at some time are masters of their fates:\\nThe fault, dear Brutus, is not in |
| Filaments | zcode | 9 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "Ce que le monde sait, c'est qu'ils étaient trois,\\nAthropos, Lachesis et Clotho |
| For a Change | zcode | 10 | **Menu drawn in the upper window** (help): 6 rows |
| Galatea | zcode | 7 | — |
| Gourmet | zcode | 8 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "A man's palate can, in time,\\nbecome accustomed to anything. / - Napoleon Bonap; **Wide fixed-width text** (intro): 54 characters: "H O R S    D ' O E U V R E S" |
| Hunter, in Darkness | zcode | 8 | **Box drawn in the upper window** (intro): under 0 status rows, key input: ":                        :\\n:                        :\\n:         Hunter       ; **Styles in the upper window** (intro): reverse video on row 8 |
| Jigsaw | zcode | 12 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "After such knowledge, what forgiveness?  Think now\\nHistory has many cunning pa; **Menu drawn in the upper window** (help): 8 rows |
| Little Blue Men | zcode | 17 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "DOCTOR: Where do you want to go?\\nJACOB:  I want to go home...\\nDOCTOR: Home? T; **Menu drawn in the upper window** (help): 7 rows |
| Los alegres hombres de Sherwood | glulx | 15 | **Graphics window** (intro): 1 graphics window(s); **Timer** (intro): 40 ms |
| Lost Pig | zcode | 14 | **Menu drawn in the upper window** (help): 8 rows |
| Make It Good | zcode | 18 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "MAKE IT GOOD / -- By Jon Ingold (c) 2000 - 2009"; **Menu drawn in the upper window** (help): 10 rows; **Wide fixed-width text** (intro): 47 characters: "Start Game - in default mode    :   [SPA" |
| Metamorphoses | zcode | 8 | **Box drawn in the upper window** (intro): under 1 status rows, line input: "sanguine, melancholic, choleric, phlegmatic" |
| Photopia | zcode | 6 | — |
| Shade | zcode | 6 | — |
| Shrapnel | zcode | 15 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "You are standing west" |
| Slouching Towards Bedlam | zcode | 11 | **Menu drawn in the upper window** (help): 9 rows; **Styles in the upper window** (help): normal, subheader |
| So Far | zcode | 6 | — |
| Spider and Web | zcode | 6 | — |
| Tapestry | zcode | 14 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "This is a place of punishment, Timothy. Those who believe they\\nmust atone infl; **Boxes on many turns** (end): 3 boxes kept |
| The Act of Misdirection | zcode | 15 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "The Act Of Misdirection / -- By Cal Harrison (c) 2004"; **Menu drawn in the upper window** (help): 9 rows; **Wide fixed-width text** (intro): 50 characters: "Start Game                      :   [SPA"; **Styles in the upper window** (intro): emphasized, normal |
| The Dreamhold | zcode | 6 | — |
| The Edifice | zcode | 16 | **Menu drawn in the upper window** (help): 9 rows |
| The Impossible Bottle | zcode | 6 | — |
| The Meteor, the Stone and a Long Glass of Sherbet | zcode | 12 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "I shall be telling this with a sigh\\nSomewhere ages and ages hence:\\nTwo roads ; **Menu drawn in the upper window** (help): 8 rows |
| The People's Glorious Revolutionary Text Adventure Game | zcode | 29 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "With the exception of capitalism\\nthere is nothing so revolting as Revolution.  |
| The Space Under the Window | zcode | 6 | — |
| Vespers | zcode | 12 | **Box drawn in the upper window** (intro): under 0 status rows, key input: "Be not forgetful to entertain\\nstrangers: for thereby some have\\nentertained an; **Menu drawn in the upper window** (about): 10 rows |

★ featured on Home.
