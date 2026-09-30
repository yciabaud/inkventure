#!/bin/sh
# Rebuilds the ink test fixture from its source with the compiler that comes with inkjs (npm install first).
# The compiled file is committed, so CI does not compile it.
set -e
cd "$(dirname "$0")/../.."
node node_modules/inkjs/bin/inkjs-compiler.js -o tests/fixtures/ink/lamp.json tests/fixtures/ink/lamp.ink
