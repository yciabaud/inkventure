# public/catalog

The catalogue the app loads (SPEC §5.2): `meta.json`, `index-<n>.json` shards of compact rows, `games/<tuid>.json`
details. **Do not edit by hand.**

What is committed here is a small **sample** (synthetic games from `tests/fixtures/ifdb/`, run through the whole
pipeline) for local development and tests; regenerate it with `npm run catalog:sample`. Deployment and preview builds
replace it with the real catalogue that the weekly Catalogue workflow publishes on the `catalog` branch
(`scripts/catalog/use-published.sh`).
