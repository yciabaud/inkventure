# Device checklist

A 15-minute scripted test of Inkventure on a real e-reader (SPEC §11.4; story S7.1), run before each release on the
Kindle (and on a Kobo when one is at hand). Copy the **Results** table at the end into the release notes
([template](release-notes-template.md)) and save the filled checklist as
`docs/device-reports/<YYYY-MM-DD>-<device>-checklist.md`.

Targets (SPEC §4.5, §10): Home ready **< 3 s** on Wi-Fi, Library first results **< 4 s**, page turn **< 300 ms**,
Z-machine turn **< 1 s**, Glulx turn **< 3 s**.

## Before you start (1 min)

1. Wi-Fi on, battery above 20 %. Note the device model and firmware (*Settings → Device options → Device info* on a
   Kindle).
2. Open **https://yciabaud.github.io/inkventure/** in the browser (Kindle: *Menu → Experimental browser*), or the pull
   request preview being tested.
3. *Settings → About*: note the **version** (commit and date). Set **Timings** to **Shown**: a small line at the top
   right then gives each time measured (`Home ready in … ms`, `First results in … ms`, `Page turned in … ms`), and
   the reader's status line gives each game turn's time.

## 1. Home (2 min)

1. Close the browser completely (Kindle: back to the home screen, then *Menu → Experimental browser* again) and open
   the app. **Record** `Home ready in … ms` — that is a cold start.
2. Check: the title, the *Featured* shelf (covers in grayscale, pager if more than one page) or *My adventures* with
   the *Continue* card if you have played before; the shelf tabs switch shelves.
3. Tap the ⋮ on a cover of *My adventures*: the menu opens (*Continue*, *Game page*, *Remove from Home*); close it.
4. *How to play*: the help page opens and turns pages; go back.

## 2. Library (3 min)

1. Tap **Library**. **Record** `First results in … ms`.
2. Search `pig`: *Lost Pig* is in the results.
3. Clear the search, open **Filters**: choose *Language: Français* and *Format: Z-code*, then *Apply*. The results
   narrow (the count says so). Reload the page: the filters are still there. Use the back button: the previous state
   comes back.
4. Turn a results page with the pager. *Clear filters*.
5. Tap a game: its page shows cover, facts, badges and the blurb in pages; *Add to Home* toggles.

## 3. Play a Z-machine game (3 min)

1. Play **9:05** (`#/play/qzftg3j8nh5f34i2`, from the Library or the Featured shelf). The download page shows
   progress, then the game.
2. Type a few commands (`look`, `inventory`, `x me`, `n`) and use a shortcut chip. **Record** the typical and worst turn
   time shown in the status line.
3. Tap the right of the text to turn a page. **Record** `Page turned in … ms` (take two or three).
4. *Aa*: change the text size; the text is laid out again, no scrolling.
5. *Reader* menu: **Save…** to a slot, play one more command, **Restore…** the slot: back where you saved. **Undo**
   goes back one turn.
6. Reload the page: the game resumes where it was (autosave). Go back to Home: the game is in *My adventures* with
   *Continue*.

## 4. Play a Glulx game (2 min)

1. Play **Three-Card Trick** (`#/play/afy6ej5cn9hof20m`). Type five commands. **Record** the first turn and the
   typical and worst turn times.
2. For an illustrated game, try **Brain Guzzlers from Beyond!** (`#/play/f55km4uutt2cqwwz`): pictures show in
   grayscale.

## 5. Play an Ink and a Twine story (2 min)

1. Ink: `#/play/fixture-ink`. Choose two choices (the buttons are at least as tall as a finger); reload: it resumes.
2. Twine: `#/play/fixture-twine-harlowe` (or a catalogue Twine game such as *Les lettres du Docteur Jeangille*,
   `#/play/rpis77r72fg8228`): links lead on, a tap on the right of the text turns its pages, the badge says
   *Experimental*.

## 6. Settings (1 min)

1. Switch the language to Français and back: every screen follows.
2. *Data and storage*: the space used is shown.
3. Set **Timings** back to **Hidden**.

## Results

| Item | Target | Measured | Pass |
|---|---|---|---|
| Device (model, firmware) | — | | |
| Version (commit, date) | — | | |
| Home ready, cold start | < 3 000 ms | | |
| Library first results | < 4 000 ms | | |
| Page turn (Z-machine reader) | < 300 ms | | |
| Z-machine turn, typical / worst (9:05) | < 1 000 ms | | |
| Glulx turn, first / typical / worst (Three-Card Trick) | < 3 000 ms | | |
| Home, Library, game page work as described | — | | |
| Save, restore, undo, resume after reload | — | | |
| Ink and Twine play | — | | |
| Problems seen (step, what happened) | — | | |
