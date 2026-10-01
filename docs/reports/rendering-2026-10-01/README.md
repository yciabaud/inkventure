# Rendering comparison — Inkventure vs reference players (2026-10-01)

**Scope**: the 32 featured games (`featured.json`, `en` locale) in production
(`https://yciabaud.github.io/inkventure/`), at the measured Kindle's viewport (636×740, DPR 1). They were compared with
**iplayif.com** (Parchment) for Z-machine and Glulx, and with **the original page** (IF Archive / unbox) for Twine.
For each game: the opening screen, then a few turns wherever a problem showed up. Follow-up stories:
[S1.12–S1.18](../../BACKLOG.md) (milestone M6).

Findings are ranked by how much they hurt play, blockers first.

---

## 🔴 Blocker 1 — Single-key prompts: only `Return` is sent, so some games never start and menus can't be left

When the game waits for one key (`CharInput`), the reader only shows **"Continue ›"**, and it always sends `return`
(`src/screens/reader/GameReader.tsx`). On a Kindle, with no physical keyboard, no other key can be sent.
→ [S1.12](../../stories/S1.12-single-key-prompts.md)

| Game | What the game asks for | What happens in Inkventure |
|---|---|---|
| **Repeat the Ending** | "Choose option 1 or 2" | "Continue" does nothing. **The game never starts.** |
| **Blue Lacuna** | "Press N to begin, R to restore, C for contents" | The same screen comes back each time. **The game never starts.** |
| **Bronze** (and any Inform game with a `HELP` menu) | Menu: N = next, P = previous, Q = quit, Enter = select | Enter always opens the first topic, then the menu again, and so on. **No other topic can be reached and the menu can't be left.** Only Restart or Load get out. |
| Anchorhead | "Press 'R' to restore; any other key to begin" | It starts, but `R` can't be sent (minor: Menu › Load exists). |

Parchment also shows the menu's legend ("N = Next / P = Previous / Q = Quit Menu / ENTER = Select",
`bronze-menu-parchment.png`). Inkventure does not (see 🟠 4).

## 🔴 Blocker 2 — Twine: the story stays invisible when the author's CSS relies on an animation

The injected e-ink stylesheet sets `*{animation:none!important}` (`src/engines/twine/twineHtml.ts`).
**Will Not Let Me Go** (Harlowe) declares `.fadeIn{opacity:0; animation:fadeIn .8s forwards}` and puts that class on
`tw-story`. With no animation, the opacity stays at 0, so **the whole story stays blank**. The text is in the DOM:
this was checked by opening the frame's `srcdoc` outside the sandbox. Compare
`will-not-let-me-go-inkventure.png` with `will-not-let-me-go-original.png`.
→ [S1.13](../../stories/S1.13-twine-animation-end-state.md)

---

## 🟠 Annoying 3 — Twine: contrast lost (white background forced, author's colours kept)

- **Detritus**: all the intro text is light cyan on white. It was made for a dark starfield
  (`detritus-inkventure.png` vs `detritus-original.png`).
- **The Den**: characters' lines are pale beige and almost invisible (`the-den-inkventure.png`).
- **A Long Way to the Nearest Star**: links are forced to black, but their button background stays dark navy, so
  every choice is black on dark. The Settings and Restart icons are black on black (`long-way-inkventure.png`).

→ [S1.14](../../stories/S1.14-twine-readable-colours.md)

## 🟠 Annoying 4 — Status line cut to its first row

`splitStatus()` reads only `status[0]`. In **Bronze**, Parchment shows three rows ("Drawbridge / Great Outdoors /
Rooms searched: 0/55") plus a compass. Inkventure shows "Drawbridge N". The legend of Inform menus (rows 2–3) is
lost for the same reason, which makes blocker 1 worse.
→ [S1.15](../../stories/S1.15-status-line-rows.md)

## 🟠 Annoying 5 — Menus pile up in the transcript

Parchment clears the screen when an Inform menu redraws itself. Inkventure ignores `clear` and **appends** every
redraw: the page count went from 4/4 to 7/7 in a few key presses, and every key needs a tap on "Back to the
present". → [S1.16](../../stories/S1.16-cleared-screens-and-menus.md)

---

## 🟡 Minor

6. **Chips ignore the context**: yes/no questions (Photopia, Eat Me, The Bat, Bronze) and numbered choices (The
   Impossible Bottle) get N/S/E/W/Up/Down/Look… (`impossible-bottle-inkventure.jpeg`).
   → [S1.17](../../stories/S1.17-contextual-answer-chips.md)
7. **9:05** shows "Moves: 0" where Parchment shows "Time: 9:05 am". The likely cause is a header flag; it has not
   been checked.
8. **Leading spaces collapsed**: `  -----` (9:05) and Anchorhead's centred title lose their indentation.
9. **Twine / SugarCube**: the UI-bar toggle is cut at the left edge, and glyphs overflow at the right edge (Detritus,
   The Den).

7–9 → [S1.18](../../stories/S1.18-small-rendering-fixes.md)

---

## What matches

- Z-machine and Glulx: on the games compared text by text (9:05, Lost Pig, The Impossible Bottle, Superluminal
  Vagrant Twin, Bronze), the **opening text is identical** to Parchment's. The status line is identical for Lost
  Pig and SVT.
- All 27 parser games load with no error, in ~3–4 s here (11 s for Repeat the Ending, hosted outside the IF Archive).
- Plain "press any key" prompts (Violet, Cragne Manor, City of Secrets, The Wizard Sniffer…) work with "Continue".
- Twine: Birdland, The Den and Detritus start, and following links works.

## Limits of this test

- The 22 other parser games were checked on Inkventure's side only (load, status, kind of input), with no text
  comparison against Parchment.
- No Ink game is featured, so Ink was not tested.
- Twine: only 1 or 2 passages per game.
- Desktop Chrome at the Kindle's viewport, not the device itself.
- Pitfall: a screenshot of a background tab can show a Twine frame as blank (a false alarm on Birdland, ruled out).
