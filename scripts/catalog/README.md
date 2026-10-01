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
(`.github/workflows/catalog-crawl.yml`): it crawls with `--record` (by default 2 pages per search and 10 records; 0 in either field means no limit)
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
  year, rating, play time, cover, IFIDs, tags. `slow` is false for every game (Glulx turns measured on the Kindle stay within the < 3 s target, S1.7).
- **Language of the file played** (S2.6): IFDB's first language, unless IFDB lists several and the description of
  the chosen download names one of them followed (or preceded) by "only" (`(English only.)`, `en français
  seulement`, `only in Spanish`…, names in English, French and the game's languages): that one is kept.
  `content-policy.json`'s `languages` map (`{ tuid: { language, reason } }`) overrides it last. `report.json`
  (`languages`) and the summary list the games changed, count the multi-language games left with their first language
  (to review by hand), and name the overrides that match no kept game.
- **Content policy**: `CONTENT_POLICY=general` (default) drops games tagged with one of `content-policy.json`'s
  `denyTags` (case-insensitive); `adult` keeps them. The `exclude` list applies to every policy.
- **Readable files** (`--cors FILE`): a file outside the IF Archive is used only when there is no IF Archive file and
  `check-cors.ts` found that the app can read it; otherwise the game is dropped (`unreadable-host`). Without `--cors`
  every host is assumed readable (local runs on the fixtures).
- **Reasons**: `no-game-file`, `unsupported-format`, `format-not-enabled`, `compressed-no-primary`, `insecure-url`,
  `unreadable-host`, `adult-content`, `excluded`.
- `--summary FILE` appends a Markdown summary, including the distribution of the raw IFDB fields (link formats,
  compression, languages, genres); the manual workflow writes it to the job summary.

## CORS check

`check-cors.ts` (`npm run catalog:cors`, live network, ≤ 1 request/s) lists the files the resolver would use outside
the IF Archive (`urlsToCheck`: games without an IF Archive file) and requests each one as the app would, from
`https://yciabaud.github.io` (`Origin` header, first bytes only, redirects followed by hand: every response must
send `Access-Control-Allow-Origin: *` or that origin, and none may lead to plain HTTP). Results go to
`data/cache/cors.json` (`{ url: { ok, checked, detail?, transient? } }`), reused for 30 days; network errors and 5xx
answers are `transient` and checked again at the next run. The weekly workflow keeps the file on the `catalog` branch
and passes it to `resolve.ts --cors`.

## Illustrated games (S2.5)

`check-pictures.ts` (`npm run catalog:pictures`, live network, ≤ 1 request/s, project `User-Agent`) resolves the raw
dataset offline (same options as `resolve.ts`, `--cors FILE` included) and inspects the files of the kept games that
are uncompressed Blorbs in a format whose engine draws pictures (`PICTURE_FORMATS`: Glulx). It reads the resource
index (`RIdx`) from the head of the file: a `Range` request for 4 KB, asked once more when the index is longer (up to
256 KB), or the first bytes of the whole response when the host ignores `Range` (closed as soon as they arrive). It
counts the `Pict` resources besides the cover (`Fspc`; when that chunk is not in the head, one picture is assumed to
be the cover). Results go to `data/cache/pictures.json` (`{ url: { checked, pictures?, size?, lastModified?, detail?,
transient? } }`), reused for 90 days and then revalidated with `If-Modified-Since`; network errors and 5xx answers are
`transient` and checked again at the next run. `resolve.ts --pictures FILE` flags the games with at least two
pictures besides the cover (`illustrated: true`, `pictures`) and counts them in `report.json`
(`counts.pictures: { blorbs, inspected, illustrated }`).

## Index and publication (S2.3)

`emit.ts` (`npm run catalog:emit`) turns `data/resolved/games.json` into the files the app loads, validates them and
writes them to `data/catalog/` (`--out`):

- `meta.json`: `{ version, built, policy, count, illustrated, shards, facets: { languages, genres, formats } }` (facets as
  `[value, count]`, most frequent first; `und` for an unknown language).
- `index-<n>.json`: `{ rows: [...] }`, 500 rows per shard sorted by title, short keys `t` TUID, `n` title, `a` author,
  `y` year, `l` language, `g` genres, `f` format, `r` rating, `rc` rating count, `s` star sort, `p` play time (min),
  `c` has cover, `sl` slow, `st` starter, `il` illustrated. Unknown values are left out; `fg` (forgiveness) is reserved (not in IFDB's JSON API).
- `games/<tuid>.json`: the resolved game (file URL and zip entry, IFIDs, tags, description, cover, IFDB link…).
- **Validation** (exit 1): row and detail schema, every row has its detail, HTTPS file URLs, each shard under the
  `catalogShard` budget of `size-budget.json`, and no drop of more than 20 % of the games against `--previous`
  (the `meta.json` currently published).

**Weekly workflow** (`.github/workflows/catalog.yml`, Mondays 04:17 UTC, or Run workflow): full crawl reusing the
record cache, CORS check, picture counts, resolve, emit, then commits `catalog/`, `cache/` (records, CORS, pictures) and
`report.json` to the **`catalog` branch**.
The deployment runs after it: `use-published.sh` copies that catalogue into `public/catalog/` before the build (preview
builds too). Without the branch, builds keep the committed sample.

**Sample**: `npm run catalog:sample` rebuilds `public/catalog/` from the synthetic fixtures (`sample.ts`); a unit test
fails while the committed sample is out of date.

## Featured selection (S2.4)

`content/featured.json` is hand-curated: `{ version: 1, items: [{ tuid, starter?, pitch: { en, fr } }] }`, a one-line
pitch (≤ 140 characters) for every UI locale (`src/i18n/*.json`).

`build-featured.ts` (`npm run catalog:featured -- --catalog DIR`) writes `DIR/featured.json`:
`{ version, built, locales: { <locale>: [row…] } }`, index rows plus `pi` (pitch) and `st` (starter). Each locale's list
holds the curated games in that language, then up to 24 of the best-rated games in that language (≥ 3 stars, by
IFDB's star sort); the app leaves out the games already in progress. `use-published.sh` runs it after copying the
published catalogue; the sample's comes from `tests/fixtures/featured.json` (`npm run catalog:sample`).

- **Check** (`--check`, CI step `check-featured.sh` against the `catalog` branch): exit 1 on a schema problem, a
  missing or overlong pitch, a TUID not in the catalogue (unknown or unplayable), a game excluded by hand or with an
  adult tag, or a game in a language that is not a UI locale.
- Without `--check`, only schema problems fail; curated games the catalogue cannot feature are dropped with a warning.
