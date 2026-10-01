# Message to the IFTF (draft)

To: the Interactive Fiction Technology Foundation, which runs IFDB and hosts the IF Archive (contact page on
iftechfoundation.org, or the IFDB contact address given on ifdb.org).

Subject: Inkventure, an e-reader front-end for IFDB games: how it uses IFDB and the IF Archive

---

Hello,

I am about to announce Inkventure (https://yciabaud.github.io/inkventure/), a free, open-source (MIT) web app for
playing interactive fiction on e-readers, the Kindle's built-in browser first. Before I do, I would like to tell you
how it uses IFDB and the IF Archive, and to check that this is fine with you.

**IFDB.** E-reader browsers cannot call the IFDB API (no CORS), so the app never does: a GitHub Actions job crawls it
once a week and publishes a static catalogue of the games that can be played in a browser (Z-machine, Glulx, ink,
Twine), about […] games. The crawl is incremental (unchanged records are reused), limited to one request per second,
and identifies itself (`User-Agent: InkventureCatalog/1.0 (+https://github.com/yciabaud/inkventure)`). Every game page
in the app links back to its IFDB page, and About says "Catalogue data from IFDB".

**Cover art** is not re-hosted: readers' browsers load it from IFDB, always as a thumbnail sized for the screen
(`coverart?id=…&thumbnail=WxH`), never at full size.

**Game files** are downloaded by the reader's browser, at play time, straight from the IF Archive (which allows
cross-origin reads), or from the host listed on IFDB when it allows them. Small files are cached in the browser;
nothing is mirrored.

If you would prefer a different crawl rate, schedule or `User-Agent`, a mention of IFTF somewhere specific, or anything
else, I will gladly change it. The code is at https://github.com/yciabaud/inkventure (the crawler is in
`scripts/catalog/`).

Thank you for keeping IFDB and the IF Archive running.

Yoann Ciabaud
