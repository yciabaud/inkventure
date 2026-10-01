#!/bin/sh
# Rebuilds the Glulx test fixtures from their Inform 6 sources.
# Needs the Inform 6 compiler and the Inform 6 standard library 6.12 *with* infglk.h (the Debian package lacks it):
#   git clone --depth 1 https://github.com/DavidGriffith/inform6lib /tmp/inform6lib
#   INFORM6LIB=/tmp/inform6lib scripts/fixtures/build-glulx.sh
# The compiled files are committed, so CI and contributors do not need Inform. picture.ulx is packed with its picture
# into picture.gblorb (scripts/fixtures/build-blorb.ts), and only the .gblorb is kept.
set -e
LIB="${INFORM6LIB:-/usr/share/inform6/library}"
# The library's own files include each other with capitalised names ("English"): give them both spellings.
CASED="$(mktemp -d)"
trap 'rm -rf "$CASED"' EXIT
for file in "$LIB"/*.h; do
  name="$(basename "$file")"
  ln -sf "$file" "$CASED/$name"
  first="$(printf '%s' "$name" | cut -c1 | tr '[:lower:]' '[:upper:]')"
  ln -sf "$file" "$CASED/$first$(printf '%s' "$name" | cut -c2-)"
done
ln -sf "$LIB/verblib.h" "$CASED/VerbLib.h" 2>/dev/null || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tests/fixtures/glulx"
inform6 -G -s +include_path="$CASED" lamp.inf lamp.ulx
inform6 -G +include_path="$CASED" media.inf media.ulx
inform6 -G +include_path="$CASED" picture.inf picture.ulx
cd "$ROOT"
node scripts/fixtures/build-blorb.ts
rm tests/fixtures/glulx/picture.ulx
