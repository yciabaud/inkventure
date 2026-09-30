#!/usr/bin/env bash
# CI check of content/featured.json (SPEC §5.3; story S2.4) against the catalogue published on the `catalog` branch:
# every curated game must be in it (playable, allowed by the content policy), in a UI locale, with a pitch for every
# UI locale. Without that branch, only the curated file itself is checked (the unit tests do that too).
set -euo pipefail

dir=data/published
if git fetch --quiet --depth 1 origin catalog 2>/dev/null; then
  rm -rf "$dir" && mkdir -p "$dir"
  git archive FETCH_HEAD catalog | tar -x -C "$dir"
  node scripts/catalog/build-featured.ts --check --catalog "$dir/catalog" ${GITHUB_STEP_SUMMARY:+--summary "$GITHUB_STEP_SUMMARY"}
else
  echo "No published catalogue (no catalog branch yet): checking the curated file alone."
  node scripts/catalog/build-featured.ts --check --catalog public/catalog --schema-only
fi
