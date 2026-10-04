# Story-file scan — 2026-10-04

Made by `npm run survey:scan` (story S7.4): 2104 parser games of the published catalogue (2055 read, 1459 Z-machine, 596 Glulx), read from their story files without playing them. Routines and functions found in many games are the libraries' and are left out, except for windows and quote boxes; see the story for the method and its limits.

## Analysis and follow-ups

Read by hand on 2026-10-04, after replaying the games listed below with the rendering survey
([rendering-survey-2026-10-04.md](rendering-survey-2026-10-04.md)).

1. **Quote boxes: 266 games (13 % of those read).** By far the most frequent problem, and the one S1.23 fixes. With
   the games whose own code draws in the upper window (426) and the replays (Aisle and Filaments' title cards,
   Vespers' epigraph during play), **S1.23 should cover any tall upper window the reader cuts**, not only `box`:
   quotations, title cards and extra rows, at a key prompt or a line prompt.
2. **Real time: 116 games** (85 Z-machine with timed input, 31 Glulx with timers). The reader never sends timer events,
   so whatever a game does on a clock does not happen: text that appears by itself, a countdown, an animation. The
   replays show timers started at the intro by Best of Three, NewGrant and Los alegres hombres de Sherwood (10–40 ms:
   animations); the Z-machine games use them later in play (Shrapnel, Fail-Safe). **Proposed story:** send timer events
   with an e-ink-friendly floor (no faster than once a second), and the Z-machine's timed input; check that a game
   waiting on a clock goes on.
3. **A Z-machine game freezes on a cancelled file prompt (an app bug, found by the replay).** glkote-term's glkapi,
   which ZVM uses, reads `fref.ref` when a restore prompt is cancelled (`fref` is null): the game stops. It happens
   when the player types RESTORE, or presses R where a game offers to restore at its start (SameGame here; Anchorhead
   offers it too). **Proposed fix:** a one-line vendor patch, with a test (Quixe's glkapi already checks).
4. **Unplayable catalogue entries: 47 games.** Their story file cannot be opened the way the app opens it: the file
   named by IFDB is not in the zip (31: a different case, `PLAQUE.Z5` vs `plaque.z5`; a typo or a truncated name; a
   compilation zip with no file named), the download is not a story (10: a page, a compilation), or the link is broken
   (5 HTTP errors) or the zip is damaged (1). And **8 Z-machine version 6 games** (Zork Zero, Arthur, Journey, Shogun…)
   are listed although the app does not play version 6. **Proposed story:** the catalogue pipeline checks each zipped
   file (case-insensitive name, single story file in the zip) and leaves out what does not open, and version 6.
5. **Hyperlinks: 25 games**, some of which ask for a link as their input (Bigger Than You Think, Never Gives Up Her
   Dead, Swigian, Dead Cities): a tap on a link would be natural on an e-reader. Post-V1 candidate.
6. **Graphics windows: 7 games** (more at run time: the replays found them in Dead Cities, Swigian and City of
   Secrets, whose window type is not a constant), **extra windows: 6**, **character graphics font: 6**: few games;
   no story proposed.
7. **Colours (197), sound (59), pictures (61), fixed-width font (63)**: ignored or silent by design (e-ink); the
   fixed-width layouts that wrap are in the rendering survey's report.
8. **Characters outside the bundled fonts: 107 games**, mostly whole alphabets (Cyrillic, Greek) of games in other
   languages: they depend on the e-reader's fallback fonts. To check on the Kindle with one of them before deciding.

## Features by number of games

| Feature | Games | What it means | Most-rated games |
|---|---:|---|---|
| Own drawing in the upper window | 426 | The game's own code writes in the upper window (maps, title cards, menus, extra status rows): the top zone shows 4 rows. | Lost Pig ★, Shade, Anchorhead ★, Galatea, Spider and Web ★, Slouching Towards Bedlam, The Dreamhold, Vespers, Shrapnel, Metamorphoses, Curses, Hunter, in Darkness… |
| Own screen clears | 412 | The game's own code clears the whole screen (title screens, chapters): a new page since S1.16. | Photopia ★, 9:05 ★, Lost Pig ★, Anchorhead ★, Galatea, Aisle, Spider and Web ★, Bronze ★, Vespers, Shrapnel, Ad Verbum, Curses… |
| Quote boxes | 266 | Calls to the box routine (Inform `box`): a quotation in the upper window (S1.23). | Photopia ★, Anchorhead ★, Aisle, Vespers, Shrapnel, Ad Verbum, Metamorphoses, Curses, Fail-Safe, Make It Good, Christminster, An Act of Murder… |
| Colours | 197 | Text or background colours set: ignored on e-ink. | Photopia ★, Violet ★, Bronze ★, Alabaster, Blue Lacuna, Make It Good, Jigsaw, Lock & Key, Aotearoa, Whom The Telling Changed, PataNoir, Mystery Science Theater 3000 Presents "Detective"… |
| Characters outside the bundled fonts | 107 | Characters the game can print that Literata and Source Sans 3 (latin) do not have. | The Impossible Bottle ★, The Warbler's Nest, The King of Shreds and Patches, Inside the Facility, Snack Time!, Child's Play, Fragile Shells, Hoosegow, rendition, Nautilisia, You've Got a Stew Going!, Forsaken Denizen… |
| Timed input (Z-machine) | 85 | Key or line input with a time limit: the reader never sends the timer, so real-time events never fire. | Shrapnel, Fail-Safe, Make It Good, Christminster, The Act of Misdirection, Delusions, Möbius, My Angel, Textfire Golf, Janitor, Constraints, Letters from Home… |
| Fixed-width font | 63 | The game switches to a fixed-width font in its own code (maps, tables, ASCII art): they may wrap. | Inside the Facility, Risorgimento Represso, Photograph: A Portrait of Reflection, Best Gopher Ever, Darkiss! Wrath of the Vampire - Chapter 1: the Awakening, The Black Lily, You Are Standing, Life On Mars?, Low-Key Learny Jokey Journey, Campus Invaders, The King and the Crown, Codex Sadistica: A Heavy-Metal Minigame… |
| Pictures | 61 | Pictures drawn (Glulx): shown in the text, not in graphics windows. | Counterfeit Monkey, Alabaster, City of Secrets, Everybody Dies, Floatpoint, Lock & Key, Best of Three, Earth and Sky 2: Another Earth, Another Sky, Earth And Sky 3: Luminous Horizon, Swigian, The Blind House, The Chinese Room… |
| Sound | 59 | Sounds played: silent in the reader. | The Weight of a Soul, Repeat the Ending, Illuminismo Iniziato, Gris et Jaune, Varkana, Sherlock: The Riddle of the Crown Jewels, One King to Loot them All, The Owl Consults, Marbles, D, and the Sinister Spotlight, Transparent, A Matter of Heist Urgency, PARANOIA… |
| Timer (Glulx) | 31 | Timer events requested: the reader never sends them (support: []), so real-time events never fire. | Best of Three, Rover's Day Out, Andromeda Apocalypse — Extended Edition, Illuminismo Iniziato, Transparent, A Matter of Heist Urgency, Psychomanteum, The Bible Retold: Following a Star, Ghosterington Night, Beat Witch, Delphina's House, A Smörgåsbord of Pain… |
| Hyperlinks | 25 | Clickable links: shown as plain text. | City of Secrets, Bigger Than You Think, Swigian, Never Gives Up Her Dead, Dead Cities, IFDB Spelunking, Molly and the Butter Thieves, PARANOIA, Portrait with Wolf, Retool Looter, The Game of Worlds TOURNAMENT!, Carma… |
| Z-machine version 6 | 8 | Graphical Z-machine: not played by the app. | Zork Zero: The Revenge of Megaboz, Arthur: The Quest for Excalibur, Journey, Shogun, Sunburst Contamination, Frobozz Magic Video Poker, Parlez-lui d'amour, The Black River Emerald |
| Graphics windows | 7 | A graphics window is opened (pictures, maps, status bars drawn): not shown. | Lock & Key, Best of Three, Illuminismo Iniziato, A Smörgåsbord of Pain, NewGrant, Wiz Lair: La Guarida del Hechicero, Los alegres hombres de Sherwood |
| Character graphics font | 6 | Z-machine font 3 (Beyond Zork style maps): drawn as letters. | SameGame, Z-snake, The Night of the Vampire Bunnies, Unchanter, Rance the Dungeonkeeper, The Black Ladder |
| Extra text grid windows | 4 | A text grid besides the status line: it shares the top zone with the status line. | Lock & Key, Best of Three, A Smörgåsbord of Pain, NewGrant |
| Extra text buffer windows | 2 | A text buffer besides the main one (side panels): mixed into the main text. | A Smörgåsbord of Pain, Los alegres hombres de Sherwood |

Characters outside the fonts, by number of games: Ё U+0401 (3), А U+0410 (3), Б U+0411 (3), В U+0412 (3), Г U+0413 (3), Д U+0414 (3), Е U+0415 (3), Ж U+0416 (3), З U+0417 (3), И U+0418 (3), К U+041A (3), Л U+041B (3), М U+041C (3), Н U+041D (3), О U+041E (3), П U+041F (3), Р U+0420 (3), С U+0421 (3), Т U+0422 (3), У U+0423 (3), Ф U+0424 (3), Х U+0425 (3), Ц U+0426 (3), Ч U+0427 (3), Ш U+0428 (3), Э U+042D (3), Я U+042F (3), а U+0430 (3), б U+0431 (3), в U+0432 (3).

## Games to replay

The 5 most-rated games of each feature worth a look, for the rendering survey (S7.3):

```
npm run survey:rendering -- --only ju778uv5xaswnlpl,op0uw1gn1tjqmjt7,j49crlvd62mhwuzu,6dj2vguyiagrhvc2,82mn545s8bt3csa4,mohwfk47yjzii14w,hsfc7fnl40k4a30q,urxrv27t7qtu52lb,2xyccw3pe0uovfad,c6x835i6o9zqfc59,jdrbw1htq4ah8q57,fq26p07f48ckfror,0f4x5i2elojxez6l,t1egxcvjz5pcm0xq,jf5zkjj3jqfllwcn,qtr168k4p9depk3l,g4uj2rf4a66ko1t8,3zp2urrzm9j9f1bx,ph0y9c8b9ugvxdrv,dlo4yld75dljqia7,r5igk4radvvxumbf,t8buiu68gvxst8ng,jiz6aljelhhpdj2n,j1qv39w1ucnlhnms,omyqeg11o9df21xz,ctz4t5drwp202e3l,712x13mgco6dnqyb,u6wzkckne4zsafyl,h9x354wyakeeanik,cu0aiddqv6c2iati,94fj4mfrxzhzpp9s,q5el4dphbf7q6e5y
```

## Not read

- Fingertips: I Hear the Wind Blow (zcode): Error: Not in the zip: windblow.zblorb
- Danse Nocturne (zcode): Error: not a Z-machine or Glulx story
- A Very Strong Gland (glulx): Error: Not in the zip: AVSG.ulx
- Help! My Vacuum Cleaner Is Broken (zcode): Error: Not in the zip: Broken.z5
- Fingertips: I'm Having a Heart Attack (zcode): Error: Not in the zip: fingertips_im_having_a_heart_attack
- Headless, Hapless (zcode): Error: Not in the zip: headless, hapless.zblorb
- Fingertips: Come On and Wreck My Car (zcode): Error: Not in the zip: Fingertips - Come on and Wreck My Car.z8
- The Moon Watch (zcode): Error: HTTP 403
- Fingertips: All Alone (zcode): Error: Not in the zip: Fingertips - All Alone.zblorb
- The Dream-Trap of Zzar (zcode): Error: not a Z-machine or Glulx story
- Fingertips: Aren't You the Guy Who Hit Me in the Eye? (zcode): Error: Not in the zip: Fingertips- Arentyoutheguy.zblorb
- The Twelve Heads of St. John the Baptist (zcode): Error: Not in the zip: baptist.zblorb
- The Voodoo You Do 2 (glulx): Error: Not in the zip: The Voodoo Do You 2.gblorb
- Which Describes How You're Feeling (zcode): Error: Not in the zip: Which Describes How You're Feel.zblorb
- All That Shimmers... (zcode): Error: not a Z-machine or Glulx story
- Fingertips: Hey Now, Everybody (zcode): Error: Not in the zip: Fingertips - Hey Now Everybody.zblorb
- See the Constellation (zcode): Error: Not in the zip: See the constellation.zblorb
- LISEY (zcode): Error: Not in the zip: lisey.gblorb
- New Cat (zcode): Error: HTTP 404
- Ragnarok: Twilight of the Gods (zcode): Error: not a Z-machine or Glulx story
- The Cenric Family Curse (zcode): Error: Not in the zip: The_Cenric_Family_Curse.zip
- A Night at Milliways (zcode): Error: Not in the zip: milliways.z5
- Assignment (zcode): Error: Not in the zip: Assign-1.z5
- Fingertips: I Heard a Sound (zcode): Error: Not in the zip: I Heard a Sound.zblorb
- Fingertips: I Walk Along Darkened Corridors (zcode): Error: Not in the zip: 37 Fingertips-I Walk Along Darkened Corridorsdarkened-corridors.zblorb
- Fingertips: Something Grabbed Ahold of My Hand (zcode): Error: Not in the zip: Fingertips - Something Grabbed Ahold of My Hand.zblorb
- Plaque (zcode): Error: Not in the zip: PLAQUE.Z5
- The Ghost Ship (zcode): Error: not a Z-machine or Glulx story
- Birth of Mind (zcode): Error: not a Z-machine or Glulx story
- Connect (zcode): Error: Not in the zip: ZCode/Connect/connect.z5
- Fingertips: Mysterious Whispers (zcode): Error: Not in the zip: Mysterious Whispers.zblorb
- Three Steps to the Left (zcode): Error: Not in the zip: 3STEPS.z5
- Turn Around (glulx): Error: Not in the zip: turn around.gblorb
- Buck the Past (glulx): Error: Not in the zip: Buck the past.gblorb
- El extraño caso de Randolph Dwight (glulx): Error: invalid zip data
- Fido and the Dead Body (zcode): Error: Not in the zip: fido.gam
- Hotel Tutorial (zcode): Error: HTTP 404
- Mansion (zcode): Error: HTTP 404
- ZedFunge (zcode): Error: Not in the zip: zdefunge-0.7.3/zdefunge.z5
- Being the Ending of the Beginning (zcode): Error: not a Z-machine or Glulx story
- The Circus of Sadness (zcode): Error: Not in the zip: boinspeed.z5
- A Remote Problem (glulx): Error: Not in the zip: Release/a remote problem.gblorb
- Revenge of the Nockle : A Speed IF (zcode): Error: Not in the zip: SpeedIF nockle.zblorb
- Revenge of the Thing-Fish (zcode): Error: Not in the zip: Werner2.z5
- The Silence of the Gods (zcode): Error: not a Z-machine or Glulx story
- GHOST LAYER (glulx): Error: not a Z-machine or Glulx story
- Return to Silli Productions (zcode): Error: HTTP 404
- Stories of Command Line - Teaching of Nmap (glulx): Error: not a Z-machine or Glulx story
- ZEDIT (zcode): Error: Not in the zip: ZEDIT/ZEDIT.z5

## Games

The 300 most-rated games with a feature (of 893), with the number of places in their code:

| Game | Format | Features |
|---|---|---|
| Photopia ★ | zcode | Quote boxes 8; Colours 13; Own screen clears 24 |
| 9:05 ★ | zcode | Own screen clears 1 |
| Lost Pig ★ | zcode | Own screen clears 1; Own drawing in the upper window 1 |
| Shade | zcode | Own drawing in the upper window 1 |
| Anchorhead ★ | zcode | Quote boxes 6; Own drawing in the upper window 2; Own screen clears 3 |
| Violet ★ | zcode | Colours 7 |
| Galatea | zcode | Own drawing in the upper window 2; Own screen clears 4 |
| Aisle | zcode | Quote boxes 1; Own screen clears 1 |
| Spider and Web ★ | zcode | Own screen clears 1; Own drawing in the upper window 2 |
| Bronze ★ | zcode | Colours 7; Own screen clears 3 |
| Counterfeit Monkey | glulx | Pictures 8 |
| Slouching Towards Bedlam | zcode | Own drawing in the upper window 1 |
| The Dreamhold | zcode | Own drawing in the upper window 1 |
| Vespers | zcode | Quote boxes 62; Own screen clears 6; Own drawing in the upper window 1 |
| Shrapnel | zcode | Quote boxes 1; Own screen clears 41; Timed input (Z-machine) 28; Own drawing in the upper window 1 |
| Ad Verbum | zcode | Quote boxes 7; Own screen clears 2 |
| Metamorphoses | zcode | Quote boxes 9; Own drawing in the upper window 2 |
| Curses | zcode | Quote boxes 52; Own screen clears 2; Own drawing in the upper window 2 |
| Alabaster | glulx | Colours 3; Pictures 22 |
| Hunter, in Darkness | zcode | Own drawing in the upper window 2; Own screen clears 1 |
| For a Change | zcode | Own screen clears 1; Own drawing in the upper window 2 |
| Fail-Safe | zcode | Quote boxes 1; Timed input (Z-machine) 7; Own drawing in the upper window 1 |
| Blue Lacuna | glulx | Colours 1 |
| City of Secrets | glulx | Pictures 6; Hyperlinks 4 |
| Everybody Dies | glulx | Pictures 1 |
| Floatpoint | glulx | Pictures 1 |
| The Space Under the Window | zcode | Own drawing in the upper window 1; Own screen clears 1 |
| A Day for Fresh Sushi | zcode | Own drawing in the upper window 1 |
| All Things Devours | zcode | Own drawing in the upper window 1 |
| The Impossible Bottle ★ | zcode | Characters outside the bundled fonts 1 (); Own drawing in the upper window 1 |
| Blue Chairs | zcode | Own screen clears 1 |
| The Warbler's Nest | zcode | Characters outside the bundled fonts 1 () |
| The King of Shreds and Patches | zcode | Characters outside the bundled fonts 1 () |
| The Edifice | zcode | Own drawing in the upper window 1 |
| Make It Good | zcode | Quote boxes 1; Timed input (Z-machine) 4; Own drawing in the upper window 1; Colours 3 |
| Christminster | zcode | Quote boxes 21; Own screen clears 1; Own drawing in the upper window 2; Timed input (Z-machine) 1 |
| An Act of Murder | zcode | Quote boxes 7 |
| Jigsaw | zcode | Quote boxes 16; Own drawing in the upper window 3; Own screen clears 5; Colours 1 |
| Earth and Sky | zcode | Own drawing in the upper window 1; Own screen clears 2 |
| Lock & Key | glulx | Graphics windows 4; Extra text grid windows 2; Pictures 20; Colours 20 |
| So Far | zcode | Own screen clears 1; Own drawing in the upper window 1 |
| A Change in the Weather | zcode | Own screen clears 4; Own drawing in the upper window 4 |
| The Act of Misdirection | zcode | Quote boxes 1; Own drawing in the upper window 1; Timed input (Z-machine) 1 |
| Little Blue Men | zcode | Quote boxes 2; Own screen clears 3; Own drawing in the upper window 1 |
| Pytho's Mask | zcode | Own drawing in the upper window 2 |
| Inside the Facility | zcode | Characters outside the bundled fonts 3 (); Fixed-width font 3 |
| Augmented Fourth | zcode | Quote boxes 1; Own drawing in the upper window 1; Own screen clears 6 |
| Conan Kill Everything | zcode | Quote boxes 1 |
| A Bear's Night Out | zcode | Quote boxes 8; Own screen clears 4; Own drawing in the upper window 4 |
| Aotearoa | glulx | Colours 4 |
| Whom The Telling Changed | zcode | Own drawing in the upper window 1; Colours 2 |
| The Moonlit Tower | zcode | Own screen clears 1; Own drawing in the upper window 1 |
| PataNoir | glulx | Colours 2 |
| Snack Time! | zcode | Characters outside the bundled fonts 4 () |
| Best of Three | glulx | Extra text grid windows 4; Graphics windows 1; Pictures 2; Timer (Glulx) 1 |
| Mystery Science Theater 3000 Presents "Detective" | zcode | Colours 1; Own screen clears 3; Own drawing in the upper window 2 |
| Damnatio Memoriae | zcode | Own screen clears 1; Colours 1 |
| Zork Zero: The Revenge of Megaboz | zcode | Z-machine version 6 1 |
| Deadline | zcode | Own screen clears 3; Own drawing in the upper window 1 |
| Endless, Nameless | zcode | Colours 762; Own screen clears 30 |
| Rover's Day Out | glulx | Colours 1; Timer (Glulx) 1 |
| Child's Play | zcode | Characters outside the bundled fonts 8 () |
| Deadline Enchanter | zcode | Quote boxes 2; Own screen clears 13; Colours 5 |
| Being Andrew Plotkin | zcode | Quote boxes 1; Own screen clears 3; Colours 3 |
| The People's Glorious Revolutionary Text Adventure Game | zcode | Quote boxes 1 |
| Fragile Shells | zcode | Characters outside the bundled fonts 6 () |
| Gourmet | zcode | Quote boxes 3; Colours 2; Own screen clears 7; Own drawing in the upper window 1 |
| Earth and Sky 2: Another Earth, Another Sky | glulx | Pictures 56 |
| Fate | zcode | Quote boxes 1 |
| The Fire Tower | zcode | Own drawing in the upper window 1; Own screen clears 1 |
| Bigger Than You Think | glulx | Hyperlinks 6 |
| The Meteor, the Stone and a Long Glass of Sherbet | zcode | Quote boxes 1; Own drawing in the upper window 1; Own screen clears 2 |
| Snowquest | zcode | Colours 5 |
| Beyond | zcode | Own screen clears 2; Own drawing in the upper window 1 |
| Winter Wonderland | zcode | Colours 16; Own screen clears 4; Own drawing in the upper window 3 |
| Risorgimento Represso | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 17 |
| Earth And Sky 3: Luminous Horizon | glulx | Pictures 132; Colours 1 |
| Tapestry | zcode | Quote boxes 14; Own screen clears 39; Own drawing in the upper window 4 |
| The Mulldoon Legacy | zcode | Quote boxes 4; Own screen clears 12; Own drawing in the upper window 3 |
| Enlightenment | zcode | Quote boxes 4; Own screen clears 3; Own drawing in the upper window 2 |
| Hoosegow | zcode | Characters outside the bundled fonts 5 () |
| rendition | zcode | Characters outside the bundled fonts 8 (ḥḍ) |
| Nautilisia | zcode | Characters outside the bundled fonts 1 () |
| You've Got a Stew Going! | zcode | Characters outside the bundled fonts 8 () |
| Balances | zcode | Own drawing in the upper window 1 |
| Swigian | glulx | Hyperlinks 6; Pictures 3 |
| The Blind House | glulx | Colours 1; Pictures 2 |
| Delusions | zcode | Quote boxes 7; Own screen clears 9; Own drawing in the upper window 4; Timed input (Z-machine) 1 |
| Eurydice | zcode | Quote boxes 1 |
| Madam Spider's Web | zcode | Own screen clears 1; Own drawing in the upper window 1 |
| The Weight of a Soul | glulx | Sound 2 |
| Forsaken Denizen | zcode | Characters outside the bundled fonts 1 (); Own drawing in the upper window 1 |
| Mite | zcode | Own screen clears 2; Own drawing in the upper window 1 |
| Repeat the Ending | glulx | Colours 3; Sound 2 |
| The Chinese Room | glulx | Pictures 1 |
| The Impossible Stairs | zcode | Characters outside the bundled fonts 1 (); Own drawing in the upper window 1 |
| The Primrose Path | zcode | Quote boxes 6; Characters outside the bundled fonts 1 (); Own screen clears 2 |
| baby tree | zcode | Quote boxes 1 |
| Party Foul | zcode | Quote boxes 1 |
| Möbius | zcode | Quote boxes 2; Own screen clears 1; Colours 6; Timed input (Z-machine) 1 |
| Masquerade | zcode | Own drawing in the upper window 1 |
| Wearing the Claw | zcode | Quote boxes 2; Own screen clears 2; Own drawing in the upper window 2 |
| Andromeda Apocalypse — Extended Edition | glulx | Colours 2; Timer (Glulx) 2 |
| Arthur: The Quest for Excalibur | zcode | Z-machine version 6 1 |
| Never Gives Up Her Dead | glulx | Hyperlinks 6 |
| The Horrible Pyramid | zcode | Characters outside the bundled fonts 8 () |
| The Legend of the Missing Hat | zcode | Characters outside the bundled fonts 1 () |
| Zork: The Undiscovered Underground | zcode | Own drawing in the upper window 1 |
| 1981 | zcode | Quote boxes 1; Own screen clears 13 |
| Dead Cities | glulx | Colours 2; Hyperlinks 3; Pictures 4 |
| Fish Bowl | zcode | Characters outside the bundled fonts 8 () |
| Muse: An Autumn Romance | zcode | Quote boxes 13; Own screen clears 12; Own drawing in the upper window 1 |
| Starborn | zcode | Colours 6; Characters outside the bundled fonts 1 () |
| The Djinni Chronicles | zcode | Own drawing in the upper window 1; Own screen clears 21 |
| Keepsake | zcode | Quote boxes 1 |
| A Day for Soft Food | zcode | Quote boxes 1; Own drawing in the upper window 1 |
| Flight of the Hummingbird | zcode | Characters outside the bundled fonts 2 () |
| The Awakening | zcode | Own screen clears 3; Own drawing in the upper window 2 |
| When in Rome 1: Accounting for Taste | zcode | Own screen clears 1 |
| Opening Night | zcode | Characters outside the bundled fonts 2 () |
| The Cabal | zcode | Own screen clears 11; Own drawing in the upper window 1 |
| The Endling Archive | glulx | Pictures 6 |
| Across The Stars: The Ralckor Incident | zcode | Quote boxes 1; Own drawing in the upper window 1; Own screen clears 2; Colours 1 |
| Dig My Grave | zcode | Quote boxes 36 |
| Heroes | zcode | Own screen clears 3 |
| Illuminismo Iniziato | glulx | Graphics windows 1; Timer (Glulx) 1; Pictures 4; Colours 3; Sound 2; Characters outside the bundled fonts 1 (ł) |
| Lists and Lists | zcode | Own screen clears 4; Own drawing in the upper window 4 |
| My Angel | zcode | Quote boxes 1; Own screen clears 3; Own drawing in the upper window 3; Timed input (Z-machine) 3 |
| Photograph: A Portrait of Reflection | zcode | Quote boxes 9; Own screen clears 29; Own drawing in the upper window 5; Fixed-width font 2 |
| Voices | zcode | Quote boxes 6; Own drawing in the upper window 1 |
| A Dark and Stormy Entry | zcode | Own drawing in the upper window 1 |
| Insight | zcode | Own drawing in the upper window 1 |
| Journey | zcode | Z-machine version 6 1 |
| My Evil Twin | zcode | Characters outside the bundled fonts 3 () |
| Oxygen | glulx | Colours 8 |
| Pascal's Wager | zcode | Quote boxes 9; Own screen clears 3; Own drawing in the upper window 1 |
| Textfire Golf | zcode | Colours 50; Own screen clears 9; Own drawing in the upper window 2; Timed input (Z-machine) 5 |
| The Temple of Shorgil | glulx | Pictures 1 |
| Zork: A Troll's-Eye View | zcode | Quote boxes 2; Own screen clears 3; Own drawing in the upper window 2 |
| Dangerous Curves | zcode | Own drawing in the upper window 1; Own screen clears 1 |
| Fifteen Minutes | zcode | Characters outside the bundled fonts 3 () |
| Final Exam | zcode | Colours 2; Own screen clears 1 |
| Gris et Jaune | glulx | Colours 1; Pictures 1; Sound 2 |
| Guess the Verb! | zcode | Quote boxes 15; Own drawing in the upper window 7 |
| Janitor | zcode | Timed input (Z-machine) 2 |
| Varkana | glulx | Sound 1; Pictures 1 |
| Wrenlaw | zcode | Characters outside the bundled fonts 5 () |
| August | zcode | Own drawing in the upper window 2; Own screen clears 2 |
| Best Gopher Ever | zcode | Fixed-width font 2; Characters outside the bundled fonts 4 () |
| Buried In Shoes | zcode | Own screen clears 9; Own drawing in the upper window 2 |
| Cheeseshop | zcode | Own drawing in the upper window 1 |
| Darkiss! Wrath of the Vampire - Chapter 1: the Awakening | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 1 |
| Nevermore | zcode | Quote boxes 11; Own drawing in the upper window 1; Own screen clears 2 |
| Dinner with Andre | zcode | Own screen clears 2; Own drawing in the upper window 1 |
| Downtown Tokyo, Present Day | zcode | Quote boxes 11; Own screen clears 21; Own drawing in the upper window 2 |
| Escape From Santaland | zcode | Colours 7 |
| Fine-Tuned | zcode | Own screen clears 2 |
| Sherlock: The Riddle of the Crown Jewels | zcode | Own drawing in the upper window 5; Own screen clears 5; Sound 2 |
| Sins Against Mimesis | zcode | Quote boxes 1; Own screen clears 4; Own drawing in the upper window 3 |
| The Black Lily | zcode | Quote boxes 4; Own screen clears 20; Own drawing in the upper window 3; Fixed-width font 1; Colours 3 |
| East Grove Hills | zcode | Characters outside the bundled fonts 3 () |
| Gigantomania | glulx | Quote boxes 1 |
| IFDB Spelunking | glulx | Hyperlinks 212 |
| Legion | zcode | Colours 152; Own screen clears 151; Own drawing in the upper window 1 |
| Constraints | zcode | Colours 20; Timed input (Z-machine) 4; Own screen clears 9; Own drawing in the upper window 7 |
| Enigma | zcode | Characters outside the bundled fonts 2 () |
| Inhumane | zcode | Own drawing in the upper window 3; Own screen clears 3 |
| Last Day of Summer | zcode | Characters outside the bundled fonts 1 () |
| Letters from Home | zcode | Quote boxes 1; Own screen clears 2; Timed input (Z-machine) 6 |
| Mercy | zcode | Own screen clears 10; Own drawing in the upper window 8; Colours 11 |
| One King to Loot them All | glulx | Colours 3; Sound 2 |
| Sunday Afternoon | zcode | Quote boxes 14 |
| Tea Ceremony | zcode | Colours 1 |
| The Cove | zcode | Own drawing in the upper window 1 |
| The Duel in the Snow | zcode | Quote boxes 1 |
| The Owl Consults | glulx | Pictures 1; Sound 2; Colours 10 |
| 5 Minutes to Burn Something! | zcode | Colours 80 |
| 9Lives | zcode | Characters outside the bundled fonts 1 () |
| Cana According To Micah | zcode | Quote boxes 5 |
| Coke Is It! | zcode | Quote boxes 1; Own drawing in the upper window 1; Own screen clears 4 |
| Degeneracy | zcode | Own screen clears 3; Own drawing in the upper window 3 |
| Further | zcode | Colours 33; Characters outside the bundled fonts 1 () |
| Marbles, D, and the Sinister Spotlight | glulx | Colours 3; Sound 2 |
| Spiral | zcode | Own screen clears 1; Own drawing in the upper window 1 |
| Suicide | zcode | Quote boxes 1 |
| Transparent | glulx | Sound 2; Timer (Glulx) 1 |
| You Are Standing | zcode | Own screen clears 1; Fixed-width font 6 |
| ASCII and the Argonauts | zcode | Own drawing in the upper window 1 |
| Baluthar | zcode | Own drawing in the upper window 1 |
| Changes | zcode | Characters outside the bundled fonts 4 () |
| Final Selection | zcode | Own screen clears 2; Own drawing in the upper window 1 |
| Inside Woman | zcode | Own drawing in the upper window 1 |
| Life On Mars? | zcode | Quote boxes 1; Own screen clears 5; Own drawing in the upper window 3; Fixed-width font 7 |
| Molly and the Butter Thieves | glulx | Hyperlinks 2 |
| Old Jim's Convenience Store | zcode | Characters outside the bundled fonts 2 () |
| Stupid Kittens | zcode | Own screen clears 8 |
| The Bible Retold: The Lost Sheep | zcode | Quote boxes 1 |
| The Magic Toyshop | zcode | Own screen clears 3; Own drawing in the upper window 2 |
| Transfer | zcode | Quote boxes 1; Own screen clears 3; Own drawing in the upper window 1 |
| A Matter of Heist Urgency | glulx | Timer (Glulx) 3; Sound 2 |
| Acid Whiplash | zcode | Quote boxes 3; Own screen clears 2 |
| Another Goddamn Escape the Locked Room Game | zcode | Own screen clears 2 |
| Condemned | zcode | Own drawing in the upper window 1; Own screen clears 5 |
| Identity | zcode | Own screen clears 1; Own drawing in the upper window 2 |
| In the End | zcode | Quote boxes 3; Own drawing in the upper window 2; Own screen clears 2 |
| PARANOIA | glulx | Hyperlinks 4; Sound 2 |
| Portrait with Wolf | glulx | Hyperlinks 4; Colours 3 |
| Psychomanteum | glulx | Sound 2; Timer (Glulx) 1 |
| Shogun | zcode | Z-machine version 6 1 |
| So, You've Never Played a Text Adventure Before, Huh? | zcode | Characters outside the bundled fonts 15 () |
| The 12:54 to Asgard | zcode | Own drawing in the upper window 1 |
| The Tower of the Elephant | zcode | Characters outside the bundled fonts 1 () |
| Vicious Cycles | zcode | Own drawing in the upper window 1 |
| Banana Apocalypse and the Rocket Pants of Destiny | zcode | Own drawing in the upper window 1 |
| Brave Bear | zcode | Quote boxes 1; Own screen clears 4 |
| Edge of the Cliff | zcode | Colours 8 |
| Low-Key Learny Jokey Journey | zcode | Fixed-width font 2 |
| Retool Looter | glulx | Hyperlinks 4; Sound 2 |
| Riverside | zcode | Characters outside the bundled fonts 1 () |
| Shadow Operative | glulx | Quote boxes 1; Sound 2 |
| Being There | glulx | Pictures 3 |
| Bloodless on the Orient Express | zcode | Characters outside the bundled fonts 1 () |
| Chicken and Egg | zcode | Own drawing in the upper window 1 |
| Escape From Summerland | zcode | Quote boxes 2; Characters outside the bundled fonts 6 () |
| Heroine's Mantle | zcode | Quote boxes 1; Own screen clears 2; Own drawing in the upper window 1 |
| Jane | zcode | Own screen clears 20; Own drawing in the upper window 1 |
| Killing Machine Loves Slime Prince | zcode | Characters outside the bundled fonts 1 (); Own drawing in the upper window 1 |
| Lunar Base 1 | zcode | Quote boxes 4 |
| Marble Madness | zcode | Own drawing in the upper window 1 |
| robotfindskitten | zcode | Colours 29; Own screen clears 7; Own drawing in the upper window 7; Timed input (Z-machine) 1 |
| The Bible Retold: Following a Star | glulx | Timer (Glulx) 1; Pictures 2 |
| The Game of Worlds TOURNAMENT! | glulx | Hyperlinks 212 |
| The Reliques of Tolti-Aph | zcode | Quote boxes 1 |
| When in Rome 2: Far from Home | zcode | Own screen clears 1 |
| All Quiet on the Library Front | zcode | Quote boxes 7; Own screen clears 2; Own drawing in the upper window 1 |
| Bonehead | glulx | Colours 2; Pictures 3 |
| Campus Invaders | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 1 |
| D'ARKUN | zcode | Own drawing in the upper window 1 |
| Donkey Kong | zcode | Own drawing in the upper window 1 |
| Eruption | zcode | Quote boxes 1; Own screen clears 2 |
| Ghosterington Night | glulx | Timer (Glulx) 1 |
| maybe make some change | glulx | Colours 1; Pictures 5; Sound 2 |
| Ralph | zcode | Quote boxes 1; Own screen clears 2; Own drawing in the upper window 1 |
| Speculative Fiction | zcode | Own screen clears 2; Own drawing in the upper window 2 |
| The King and the Crown | zcode | Fixed-width font 4; Characters outside the bundled fonts 26 () |
| Beat Witch | glulx | Quote boxes 1; Sound 2; Timer (Glulx) 1 |
| Book and Volume | zcode | Own drawing in the upper window 2 |
| Building | zcode | Own screen clears 2; Own drawing in the upper window 2 |
| Codex Sadistica: A Heavy-Metal Minigame | zcode | Colours 45; Fixed-width font 1; Characters outside the bundled fonts 14 () |
| Delphina's House | glulx | Sound 8; Timer (Glulx) 7 |
| Internal Vigilance | zcode | Quote boxes 8; Own screen clears 11 |
| Into The Sun | zcode | Own screen clears 3; Own drawing in the upper window 3; Fixed-width font 1 |
| On Optimism | zcode | Quote boxes 4; Colours 1; Own screen clears 4; Own drawing in the upper window 3 |
| Snatches | zcode | Own screen clears 3; Own drawing in the upper window 1 |
| The Guardian | zcode | Characters outside the bundled fonts 3 () |
| The Mind Electric | zcode | Quote boxes 8; Own screen clears 5; Own drawing in the upper window 4 |
| What-IF? | zcode | Quote boxes 9; Own screen clears 1; Own drawing in the upper window 1 |
| Dr Ego and the egg of Man-Toomba | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 40 |
| Entangled | zcode | Colours 1; Fixed-width font 4; Own screen clears 4; Own drawing in the upper window 4 |
| Fingertips: Fingertips | zcode | Characters outside the bundled fonts 1 () |
| Interface | zcode | Characters outside the bundled fonts 5 () |
| Mystery House Possessed | zcode | Own drawing in the upper window 1; Timed input (Z-machine) 1 |
| Our Lady of Thorns | zcode | Fixed-width font 3; Own screen clears 3; Own drawing in the upper window 2; Colours 5 |
| Solitary | zcode | Quote boxes 2 |
| The Big Scoop | zcode | Quote boxes 2 |
| The Witch | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 1 |
| Tookie's Song | zcode | Quote boxes 1; Timed input (Z-machine) 1; Own screen clears 2 |
| Traffic | zcode | Own screen clears 3; Own drawing in the upper window 2; Fixed-width font 2 |
| A Smörgåsbord of Pain | glulx | Extra text grid windows 2; Extra text buffer windows 1; Graphics windows 1; Colours 3; Sound 5; Timer (Glulx) 3; Pictures 3; Characters outside the bundled fonts 1 (μ) |
| Antifascista | zcode | Quote boxes 1 |
| Enemies | zcode | Own screen clears 1 |
| Fox, Fowl and Feed | zcode | Colours 1; Own screen clears 4; Own drawing in the upper window 4 |
| Labyrinth | zcode | Own screen clears 2; Own drawing in the upper window 1 |
| Milliways: the Restaurant at the End of the Universe | zcode | Colours 3; Own screen clears 6; Own drawing in the upper window 4 |
| Mother Loose | zcode | Own screen clears 4; Own drawing in the upper window 1 |
| Pegasus | glulx | Quote boxes 3 |
| Pick Up The Phone Booth And Die 2 | zcode | Quote boxes 3; Own screen clears 2; Own drawing in the upper window 1 |
| Star City | zcode | Characters outside the bundled fonts 1 () |
| The Enigma of the Old Manor House | zcode | Characters outside the bundled fonts 2 (); Fixed-width font 1 |
| The Lost Spellmaker | zcode | Own screen clears 5; Own drawing in the upper window 4; Timed input (Z-machine) 1 |
| Wish | zcode | Own drawing in the upper window 1; Own screen clears 1 |
| Zugzwang | zcode | Own drawing in the upper window 1; Colours 1; Own screen clears 1 |
| Ekphrasis | glulx | Pictures 25; Sound 1 |
| Everything We Do Is Games | zcode | Characters outside the bundled fonts 2 () |
| Ferrous Ring | glulx | Pictures 1; Timer (Glulx) 1 |
| GATOR-ON, Friend to Wetlands! | zcode | Quote boxes 1; Own screen clears 2; Own drawing in the upper window 1 |
| Heist | zcode | Quote boxes 1; Own screen clears 1; Own drawing in the upper window 1; Timed input (Z-machine) 1 |
| Identity Thief | zcode | Quote boxes 1; Own screen clears 5; Own drawing in the upper window 1 |
| Just Two Wishes | zcode | Own screen clears 3; Own drawing in the upper window 3; Fixed-width font 1; Colours 6 |
| Prized Possession | zcode | Own drawing in the upper window 1 |
| She's Actual Size | glulx | Quote boxes 5; Colours 9 |
| Sycamora Tree | zcode | Quote boxes 1; Own screen clears 2 |
| The Chicken Under the Window | zcode | Own drawing in the upper window 1; Own screen clears 2 |
| The Mulldoon Murders | zcode | Quote boxes 1; Timed input (Z-machine) 3; Own screen clears 1; Own drawing in the upper window 1 |
| The Promise | glulx | Quote boxes 1 |
| The Temple | zcode | Own drawing in the upper window 1 |
| Three More Visitors | zcode | Quote boxes 4; Own drawing in the upper window 1; Own screen clears 4 |
| Typo! | zcode | Quote boxes 1; Timed input (Z-machine) 2 |
| Arid and Pale | zcode | Characters outside the bundled fonts 1 () |
| Bullhockey! | glulx | Characters outside the bundled fonts 1 (椀) |

★ featured on Home.
