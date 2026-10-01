# The image the Ebook and Deploy workflows build the ebooks in (SPEC §8): Playwright's (its Chromium renders the
# cover), with Pandoc, EPUBCheck and Calibre preinstalled, so a run does not spend minutes on apt (a slow mirror once
# held it for 20). Built and published to ghcr.io/yciabaud/inkventure-ebook by .github/workflows/ebook-image.yml,
# tagged like its base. The tag must match @playwright/test in package.json: bump it here, in ebook.yml, deploy.yml
# and ci.yml together.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pandoc epubcheck calibre \
  && rm -rf /var/lib/apt/lists/* \
  && pandoc --version | head -1 \
  && ebook-convert --version | head -1 \
  && test -e /usr/bin/epubcheck
