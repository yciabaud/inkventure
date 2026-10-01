# Catalogue data

Published by the Catalogue workflow (.github/workflows/catalog.yml) on main. Do not edit by hand.

- `catalog/`: the files the app loads (copied into public/catalog/ by deployment builds).
- `cache/viewgame/`: IFDB records, reused while their page version is unchanged.
- `cache/cors.json`: whether the app can read each story file outside the IF Archive (CORS).
- `cache/pictures.json`: pictures besides the cover in each Blorb that could hold some (illustrated games).
- `cache/ink.json`: the file holding the story in each web export of an ink game.
- `report.json`: games left out, with their reasons.
