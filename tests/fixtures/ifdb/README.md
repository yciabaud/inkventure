# IFDB fixtures

Recorded-style responses for the catalogue crawler (`scripts/catalog/crawl.ts --offline`, unit tests). Each file is
`{ url, status, body }`, named by `fixtureName(url)` in `scripts/catalog/fetcher.ts`.

These are **synthetic**: the games, authors and TUIDs (`fx…`) are invented, and the responses are shaped after IFDB's
source code (`www/search`, `www/viewgame-components/viewgame-api.php` in iftechfoundation/ifdb) and API pages, because
the development environment cannot reach ifdb.org. Real responses can replace them with
`node scripts/catalog/crawl.ts --record --limit 5` (see `scripts/catalog/README.md`).

What they cover: a search with a short first page that is not the last one (IFDB leaves hidden games out of a page),
an empty search, games with and without cover art (page version in the cover link or not), and a listing that no
longer exists (`{"error": …}`), which the crawler skips. *Cave of Echoes* is in French with an English translation
(`echoes_en.z5`), for the files per language of S2.6.
