# scripts/catalog

Catalogue pipeline: crawler, resolver, emitter and `content-policy.json` (SPEC §5).

## Crawler (S2.1)

`crawl.ts` pages through the IFDB game searches listed in `queries.json` (one candidate per TUID, union of the
searches), then fetches each candidate's `viewgame?json` record and writes the raw dataset to `data/raw/games.json`
(`{ source, queries, games: [{ tuid, pageVersion, queries, search, record }] }`, sorted by TUID, no dates: the same
responses always give the same file). Listings IFDB no longer serves are skipped and reported; IFDB errors that
persist after the retries (429, 5xx, network) stop the run.

- **Politeness**: at most 1 request per second, `User-Agent: InkventureCatalog/1.0 (+https://github.com/yciabaud/inkventure…)`,
  retries with exponential backoff from 2 s (4 retries), honouring `Retry-After`.
- **Incremental**: records are cached per game in `data/cache/viewgame/<tuid>.json`. A record is reused when the
  page version in the search row (IFDB versions the cover art link with it) is unchanged; games without cover art
  have no version in search rows, so their record is fetched again after 30 days.
- **Modules**: `ifdb.ts` (URLs, response parsing), `fetcher.ts` (rate limiter, retries, live / recording / offline
  fetchers), `crawler.ts` (search paging, candidates, records, cache), `crawl.ts` (command line).

### Running it

```sh
npm run catalog:crawl -- --offline              # replays tests/fixtures/ifdb, no network (what the tests use)
npm run catalog:crawl                           # live: ifdb.org, ~1 request/s, writes data/raw/games.json
npm run catalog:crawl -- --limit 20             # live, only the first 20 candidates (a quick check)
npm run catalog:crawl -- --record --limit 5     # live, saving every response into tests/fixtures/ifdb
```

Other options: `--out DIR` (default `data/raw`), `--cache DIR` (default `data/cache/viewgame`), `--queries FILE`,
`--fixtures DIR`, `--max-pages N` (stop each search after N pages of 100 games: a partial crawl, for checks). `data/` is gitignored.

To check the live API without a local setup, run the **Catalogue crawl (manual)** workflow from the Actions tab
(`.github/workflows/catalog-crawl.yml`): it crawls with `--record` (by default 2 pages per search and 10 records)
and keeps `data/raw/games.json` and the recorded responses as the `catalog-crawl` artifact for 14 days.

The live run is **never** executed in PR CI (tests only use the fixtures). It will run in the scheduled catalogue
workflow (S2.3). A first full run makes one request per search page (100 games each) plus one per game, so expect
roughly an hour or two for a few thousand games; later runs mostly reuse the cache.

After re-recording fixtures, check that the tests still describe them (`scripts/catalog/crawler.test.ts`).

## Playability (S2.2)

`resolve.ts` (`npm run catalog:resolve`) reads `data/raw/games.json` and writes `data/resolved/games.json` (the games
the app can play) and `data/resolved/report.json` (every game left out, with its reason, and counts). No network.

- **Formats**: a download link's story format comes from IFDB's format id (`zcode`, `blorb/zcode`, `glulx`,
  `blorb/glulx`), else the file name (`.z1`–`.z8`, `.zblorb`, `.ulx`, `.gblorb`…); Twine is an HTML
  `hypertextgame` from a Twine development system, ink a compiled `.json`. Only the formats listed in
  `playability.json` are kept (today `zcode`; enable each one with its engine).
- **Best file**: first enabled format, then the IF Archive (CORS verified), then uncompressed, then blorb, then IFDB's
  order. A zip is used only when IFDB names the story file inside it (`compressedPrimary`). IF Archive links are
  upgraded to HTTPS; other plain-HTTP links are refused (mixed content).
- **Metadata**: language reduced to its primary subtag (`en-US` → `en`, `English` → `en`), genres split on `/ , ;`,
  year, rating, play time, cover, IFIDs, tags. `slow` is provisional: every Glulx game (S1.7 will measure).
- **Content policy**: `CONTENT_POLICY=general` (default) drops games tagged with one of `content-policy.json`'s
  `denyTags` (case-insensitive); `adult` keeps them. The `exclude` list applies to every policy.
- **Reasons**: `no-game-file`, `unsupported-format`, `format-not-enabled`, `compressed-no-primary`, `insecure-url`,
  `adult-content`, `excluded`.
- `--summary FILE` appends a Markdown summary, including the distribution of the raw IFDB fields (link formats,
  compression, languages, genres); the manual workflow writes it to the job summary.
