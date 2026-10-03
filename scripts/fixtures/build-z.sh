#!/bin/sh
# Rebuilds the Z-machine test fixtures from their Inform 6 sources.
# Needs the Inform 6 compiler and standard library (Debian/Ubuntu: apt-get install inform6-compiler inform6-library).
# The compiled file is committed, so CI and contributors do not need Inform.
set -e
cd "$(dirname "$0")/../../tests/fixtures/zmachine"
inform6 -v5 -s +include_path=/usr/share/inform6/library lamp.inf lamp.z5
inform6 -v5 -s +include_path=/usr/share/inform6/library clock.inf clock.z5
