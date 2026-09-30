# src/catalog

Catalogue index loader, filters and search (SPEC §5).

- `loader.ts`: `meta.json` + index shards; `filters.ts`, `search.ts`: the Library's filters, sort and search.
- `game.ts`: a game's detail (`games/<tuid>.json`) and its blurb.
- `storyFile.ts` (lazy chunk, with the unzip code): story file download (XHR, progress, stall timeout), zip extraction
  and `fetchStory` (cache, download, header check); `storyFileError.ts`: its failures.
