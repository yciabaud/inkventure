# Launch (S7.2)

Drafts and steps for the public release. Nothing here is sent automatically: the owner posts and sends.

## Before announcing

1. `main` deployed, CI green; the last Deploy run's `ebook` job succeeded (the ebook page lists four books).
2. **Production smoke** workflow run on the live address (Actions → Production smoke → Run workflow): green.
3. The [real-device checklist](../device-checklist.md) run on the Kindle with the deployed build, recorded in
   `docs/device-reports/` and in the release notes ([template](../release-notes-template.md)).
4. Tag the release (`v1.0.0`): the Ebook workflow attaches both books (EPUB and AZW3) to the tag's GitHub release
   (creating a draft release if the tag was pushed with git).
5. Fill the `[…]` placeholders in the drafts below (number of games, release date, links that changed).

## Messages

- [IFTF / IFDB](iftf-message.md): to send **before** the announcements (SPEC §5.6).
- [intfiction.org announcement](announcement-en.md), in English (forum category *General Discussion* or *Tools*).
- [French announcement](announcement-fr.md), for the French-speaking community (forum of fiction-interactive.fr).

## Address

The site stays at `https://yciabaud.github.io/inkventure/` (no custom domain for V1). To move it to a custom domain
later: add the domain in **Settings → Pages**, put a `CNAME` file in `public/`, set `host` in `ebook/config.json` (the
ebook's links and the production smoke test read it), update the README, and add the new origin where the catalogue
checks file hosts' CORS (`scripts/catalog/cors.ts`, `APP_ORIGIN`). Books already downloaded keep the old links:
GitHub Pages redirects the `github.io` address to the custom domain, so they keep working.
