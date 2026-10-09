# Release notes

Push a `v*` tag with git (`git tag v1.0.0 && git push origin v1.0.0`): the Ebook workflow creates a **draft** GitHub
release with the EPUB and AZW3 books attached; read it, then publish it (SPEC §11.5). The release gets its notes from the Ebook workflow (`.github/workflows/ebook.yml`, story S7.5),
written by `scripts/release/build-notes.ts`: the catalogue, the stories done since the previous tag, the latest device
checklist, the first-load sizes, the stories still open and the ebooks attached.

What only the owner can say goes in an optional file here, named after the tag (`v1.0.0.md`), committed before
tagging:

- its text is put after the release's title (the highlights, in a few bullets);
- the bullets of its `### Known issues` section come first in the release's Known issues.

Preview the notes locally before tagging:

```sh
scripts/catalog/use-published.sh && npm run build && npm run check:size -- --json sizes.json
npm run release:notes -- --tag v1.0.0 --sizes sizes.json
```

The device results are copied from the latest `docs/device-reports/*-checklist.md`: run the
[device checklist](../device-checklist.md) on the build to release and commit its report first.
