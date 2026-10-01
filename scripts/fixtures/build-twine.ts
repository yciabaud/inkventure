// `npm install` / `npm ci` postinstall: builds the Twine test fixtures (tests/fixtures/twine/*.twee → *.html) with
// their story formats, downloaded once from the Story Format Archive into vendor/twine/ and checked against the
// SHA-256 it publishes. The built files are not committed (they embed the formats' minified code). Exits 1, with the
// reason, when a format cannot be fetched. Run again by hand after editing a .twee: node scripts/fixtures/build-twine.ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { formatSource, parseTwee, publish } from './twee.ts';

const ARCHIVE =
  'https://raw.githubusercontent.com/videlais/story-formats-archive/refs/heads/docs/official/twine2/';
const CACHE = 'vendor/twine';

const FIXTURES = [
  {
    twee: 'tests/fixtures/twine/lamp-harlowe.twee',
    html: 'tests/fixtures/twine/lamp-harlowe.html',
    format: 'harlowe/3.3.9/format.js',
    sha256: '803a0d9d4fb8c3c1c99eaf16f37db6feaad72e36fc7e5f6c5a168465419895f3',
  },
  {
    twee: 'tests/fixtures/twine/lamp-sugarcube.twee',
    html: 'tests/fixtures/twine/lamp-sugarcube.html',
    format: 'sugarcube/2.37.3/format.js',
    sha256: '64ccdac806a162d250273aba3c39aee85765fedab4cf70e6176154a8c34b8820',
  },
];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The story format, from the cache when it holds the expected file, else downloaded and cached. */
async function storyFormat(path: string, expected: string): Promise<Uint8Array> {
  const cached = join(CACHE, path);
  if (existsSync(cached)) {
    const bytes = new Uint8Array(readFileSync(cached));
    if (sha256(bytes) === expected) return bytes;
  }
  const response = await fetch(ARCHIVE + path, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = sha256(bytes);
  if (hash !== expected) throw new Error(path + ': unexpected SHA-256 ' + hash);
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
}

try {
  for (const fixture of FIXTURES) {
    const format = await storyFormat(fixture.format, fixture.sha256);
    const story = parseTwee(readFileSync(fixture.twee, 'utf8'));
    const html = publish(story, formatSource(new TextDecoder().decode(format)));
    if (!existsSync(fixture.html) || readFileSync(fixture.html, 'utf8') !== html) {
      writeFileSync(fixture.html, html);
      console.log('Built ' + fixture.html);
    }
  }
} catch (error) {
  console.error(`Could not build the Twine test fixtures: ${(error as Error).message}`);
  process.exit(1);
}
