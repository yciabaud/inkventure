# Announcement for intfiction.org (draft)

Title: Inkventure: play IFDB games on your e-reader (Kindle browser and others)

---

Hi all,

I have built **Inkventure**, a free web app for playing interactive fiction on e-readers:
**https://yciabaud.github.io/inkventure/**

E-ink screens are lovely for reading, and IF is mostly reading, but e-reader browsers are slow, small and hate
scrolling. Inkventure is designed around them:

- **The catalogue comes from IFDB**: about […] games that run in a browser (Z-machine, Glulx, ink, and Twine as an
  experiment), with search, filters (genre, language, play time, rating, illustrated…) and a short featured list of
  good first games. It is rebuilt every week.
- **The reader turns pages instead of scrolling**, with no animations. Parser games get a command bar with verb chips,
  and you can tap words in the text to build a command; choice-based games get large buttons.
- **Saves stay on the device**: autosave on every turn, five save slots, undo.
- **English and French** interface, and games in many languages.
- No account, no tracking, no ads. Static site, open source (MIT):
  https://github.com/yciabaud/inkventure

There is also a **free ebook** (English and French, EPUB and AZW3), a short guide to IF whose pages open games in the
app with one tap, handy to put on an e-reader: https://yciabaud.github.io/inkventure/ebook/

The interpreters are the community's own: ZVM and GlkOte (Dannii Willis), Quixe (Andrew Plotkin) and inkjs. Game files
are downloaded from the IF Archive at play time, and every game links back to its IFDB page. Many thanks to the IFTF
and to everyone who maintains these.

It is tested on a recent Kindle; I would love reports from other e-readers (Kobo, PocketBook, Boox…). A device probe
page collects what a browser can do: https://yciabaud.github.io/inkventure/probe/ . Bugs and games that misbehave:
https://github.com/yciabaud/inkventure/issues

Authors: if you would rather your game were not listed, tell me and I will remove it.
