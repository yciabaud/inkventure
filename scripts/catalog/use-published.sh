#!/usr/bin/env bash
# Replaces the sample catalogue in public/catalog/ with the one the weekly Catalogue workflow published on the
# `catalog` branch (SPEC §5.2 step 6), before a deployment or preview build. Without that branch, the sample stays.
set -euo pipefail

if git fetch --quiet --depth 1 origin catalog 2>/dev/null; then
  find public/catalog -mindepth 1 ! -name README.md -exec rm -rf {} +
  git archive FETCH_HEAD catalog | tar -x -C public
  echo "Using the published catalogue: $(node -p "require('./public/catalog/meta.json').count") games."
else
  echo "No published catalogue (no catalog branch yet): keeping the sample."
fi
