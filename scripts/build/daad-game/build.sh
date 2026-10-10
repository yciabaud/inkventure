#!/bin/sh
# Rebuilds The Lamp Room (story S0.13) into public/probe/daad/: lamp-room.jddb (the database as jDAAD's DDBDATA,
# compiled by the DAAD Reborn Compiler for its HTML target) and images.js (the pictures, by pictures.ts). Not run by
# `npm install` or CI: the compiled output is committed.
#
# Needs PHP and the DAAD Reborn Compiler: DRC_SRC is the src/ folder of a checkout of https://github.com/Utodev/DRC
# with the frontend built by Free Pascal (`fpc -g -gl drf.pas`; built with -O2 it crashed on this template). The
# S0.13 build used DRC commit 71df4e54 (frontend 0.40, backend 0.36).
#
#   DRC_SRC=../DRC/src sh scripts/build/daad-game/build.sh
set -eu
: "${DRC_SRC:?set DRC_SRC to the src folder of a DRC checkout, with drf built}"
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../../public/probe/daad"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp "$here/lamp-room.dsf" "$work/LAMP.DSF"
(
  cd "$work"
  "$DRC_SRC/drf" html LAMP.DSF -v3
  php "$DRC_SRC/drb.php" html EN LAMP.json LAMP.DDB
)
cp "$work/lamp.jddb" "$out/lamp-room.jddb"
node "$here/pictures.ts" "$work"
cp "$work/images.js" "$out/images.js"
echo "Wrote $out/lamp-room.jddb and $out/images.js"
