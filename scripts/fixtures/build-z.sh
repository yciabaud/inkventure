#!/bin/sh
# Rebuilds the Z-machine test fixture from its Inform 6 source.
# Needs the Inform 6 compiler and standard library (Debian/Ubuntu: apt-get install inform6-compiler inform6-library).
# The compiled file is committed, so CI and contributors do not need Inform.
set -e
cd "$(dirname "$0")/../../tests/fixtures/zmachine"
inform6 -v5 -s +include_path=/usr/share/inform6/library lamp.inf lamp.z5
